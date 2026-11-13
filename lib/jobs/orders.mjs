/**
 * 订单类作业 —— 订单查询 → 批量导出（对账报表）→ 到导出记录页下载。
 *
 * 国内店与跨境店是同一套页面动作（订单查询 → 批量导出 → 对账报表 → 生成报表 → 下载报表），
 * 差别只在店铺范围，所以合成一个 run 函数，外面挂两条作业（国内 / 海外）。
 *
 * 关键实测细节（2026-11 在本店 Chrome 上验证）：
 *   - 「批量导出」弹窗里的报表类型是 label，文字是「对账报表」
 *   - 点「生成报表」后站点会**开一个新标签**：/orders/exportExcel?exportType=0
 *     （少这个参数直连只会看到后台空壳页，没有下载按钮）
 *   - 导出记录页里第一行的下载按钮在 .download-box 里
 */
import { closePage, listPages, newPage, Session, sleep, waitForTab } from '../engine/cdp.mjs';
import { assertAlive, clickTextAny, downloadByClick, openPage, URLS, waitAndClick } from './common.mjs';

const portFromWs = (wsUrl) => {
  try { return Number(new URL(String(wsUrl).replace(/^ws/, 'http')).port) || 0; } catch { return 0; }
};

export async function runOrderExport(session, { downloadDir, log = () => {}, store } = {}) {
  const port = Number(store && store.port) || portFromWs(session.wsUrl);
  await openPage(session, URLS.mmsOrders, { waitText: 800, timeoutMs: 40000 });
  await assertAlive(session, { what: '订单查询页' });
  log('订单查询已打开');

  // 1) 「全部订单」tab（文字带条数，所以用 includes）
  const tabOk = await clickTextAny(session, '全部订单', {
    selector: '[data-testid="beast-core-tab-itemLabel"]', exact: false, timeoutMs: 10000, what: '「全部订单」tab',
  }).catch(() => false);
  log(tabOk ? '已切到「全部订单」' : '没找到「全部订单」tab，按当前 tab 继续');
  await sleep(2000);

  // 2) 批量导出（弹窗有时慢、有时被站内提示条挡一次，点不开就重试一次）
  const openDialog = () => waitAndClick(session, `Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '批量导出')`, {
    timeoutMs: 12000, what: '「批量导出」按钮',
  });
  const modalReady = async (timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await session.evaluate(`Array.from(document.querySelectorAll('[data-testid="beast-core-modal"]')).some((m) => (m.innerText || '').includes('批量导出订单'))`).catch(() => false);
      if (ok) return true;
      await sleep(400);
    }
    return false;
  };
  await openDialog();
  if (!(await modalReady(6000))) {
    log('「批量导出」没弹出窗，重试一次');
    await session.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === '批量导出'); if (b) b.click(); return !!b; })()`).catch(() => false);
    if (!(await modalReady(8000))) throw Object.assign(new Error('「批量导出」弹窗没打开（可能被站内弹层挡住）'), { code: 'MODAL_NOT_FOUND' });
  }

  // 3) 报表类型：对账报表
  const picked = await clickTextAny(session, '对账报表', {
    selector: 'label[data-testid="beast-core-radio"]', exact: true, timeoutMs: 10000, what: '「对账报表」选项',
  }).catch(() => false);
  if (!picked) throw Object.assign(new Error('导出弹窗里没有「对账报表」选项（页面可能改版）'), { code: 'REPORT_TYPE_MISSING' });
  log('报表类型：对账报表');
  await sleep(600);

  // 4) 生成报表 → 站点一般会开新标签（导出记录页）；没开就用当前标签打开
  const before = (await listPages(port).catch(() => [])).map((p) => p.id);
  const submittedAt = Date.now();
  await waitAndClick(session, `Array.from(document.querySelectorAll('[data-testid="beast-core-modal"] button')).find((b) => (b.textContent || '').trim() === '生成报表')`, {
    timeoutMs: 10000, what: '「生成报表」按钮',
  });
  log('已点「生成报表」，等导出记录页…');

  // 站点有时自己开一个新标签，有时不开。不管开不开，这里都**另开一个干净标签**去下载：
  // 点过弹窗的那个标签，Input 通道常常已经卡住（真实点击会超时），换个标签最稳。
  let siteTab = null;
  try {
    siteTab = await waitForTab(port, /orders\/exportExcel/, { timeoutMs: 8000, exclude: before });
  } catch { /* 没开就算了 */ }
  const exportUrl = (siteTab && siteTab.url) || 'https://mms.pinduoduo.com/orders/exportExcel?exportType=0';
  log(`导出记录页：${exportUrl}`);
  const fresh = await newPage(port, exportUrl);
  const child = new Session(fresh.webSocketDebuggerUrl);
  const tabId = fresh.id;
  if (siteTab) await closePage(port, siteTab.id).catch(() => {});
  let file;
  let reportTime = '';
  try {
    // 报表生成需要时间，而且这个页面**永远显示最近一次已生成的报表**（可能是几分钟前那次）。
    // 所以不能「看到下载按钮就点」——要等它的「生成报表时间」不早于我们刚才点生成的时间。
    const STAMP = `(() => {
      const box = document.querySelector('.download-box');
      const text = box ? box.innerText : (document.body ? document.body.innerText : '');
      const m = text.match(/生成报表时间：\\s*(\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2})/);
      return m ? m[1] : '';
    })()`;
    const deadline = Date.now() + 40000;
    let ready = false;
    for (;;) {
      await child.navigate(exportUrl, 2500);
      const stamp = await child.evaluate(STAMP).catch(() => '');
      reportTime = String(stamp || '');
      const ts = reportTime ? new Date(reportTime.replace(' ', 'T') + ':00').getTime() : 0;
      if (ts && ts >= submittedAt - 3 * 60 * 1000) { ready = true; break; }
      if (Date.now() >= deadline) break;
      log(`导出记录页还是旧报表（${reportTime || '读不到时间'}），8 秒后重试`);
      await sleep(8000);
    }
    if (!ready) {
      // 兜底：实在没等到新的，就把页面上现有的报表交出去，但在 extra 里标明生成时间
      const hasBtn = await child.evaluate(`!!document.querySelector('.download-box [data-testid="beast-core-button"]')`).catch(() => false);
      if (!hasBtn) throw Object.assign(new Error(`导出记录页 150 秒内没出现「下载报表」（最后一次看到：${reportTime || '无'}）`), { code: 'EXPORT_NOT_READY', reportTime });
      log(`警告：没等到本次生成的报表，下载页面上最近一份（${reportTime || '时间未知'}）`);
    }

    file = await downloadByClick(child, downloadDir || '', {
      expr: `document.querySelector('.download-box [data-testid="beast-core-button"]') || Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '下载报表')`,
      what: '下载报表',
      log,
      mouseFirst: false,
      timeoutMs: Number(process.env.RPA_DL_TIMEOUT) || 20000,
    });
    log(`文件已落盘：${file.name}（${Math.round(file.size / 1024)} KB）`);
  } finally {
    try { child.close(); } catch { /* ignore */ }
    await closePage(port, tabId).catch(() => {});
  }

  // 首页那个弹窗收尾：Esc 关掉，避免影响下一次运行
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, 3000).catch(() => {});
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, 3000).catch(() => {});

  return {
    range: null,
    file: { path: file.path, name: file.name, size: file.size },
    extra: { reportUrl: exportUrl, reportTime, scope: 'orders_all_recent_3m' },
  };
}
