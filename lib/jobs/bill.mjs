/**
 * 财务类作业 —— 把「对账单 / 保证金账单」下载下来。
 *
 * 对应原来的 3 份 Automa：
 *   1. pdd国内下载对账单-月    → 对账中心「货款账户」→ 上月整月 → 导出 → 下载
 *   2. pdd下载海外对账单-月    → 跨境店铺的财务流水页（国内店铺会走同一个对账中心）
 *   9. pdd国内下载保证金-月    → 对账中心「保证金账户」→ 上月整月 → 导出 → 下载
 *
 * 与 Automa 的关键差别（都是踩过的坑）：
 *   - 不再靠「点第一个文本为 1 的格子、再点它前面那个格子」表达整月，见 common.pickMonthRpr
 *   - 不再切标签页：mms 的 /cashier/finance/payment-bills 会做一次 SSO 再落到 cashier，
 *     直连 cashier.pinduoduo.com 会「登录异常」
 *   - 导出后不再盲等固定秒数：轮询「下载」入口，出来就点，文件落盘才算成功
 */
import { closePage, listPages, Session, sleep, waitForTab } from '../engine/cdp.mjs';
import { assertAlive, clickByText, clickTextAny, downloadByClick, openPage, pickMonthRpr, readTable, URLS, waitAndClick } from './common.mjs';

const KINDS = {
  goods: {
    label: '货款账户',
    tabText: '货款账户',
    exportSel: `document.querySelector('#exportBalance-btn')`,
    readySel: `document.querySelector('#exportBalance-btn')`,
  },
  deposit: {
    label: '保证金账户',
    tabText: '保证金账户',
    exportSel: `document.querySelector('#export-btn')`,
    readySel: `document.querySelector('#export-btn')`,
  },
};

/** 等「下载」入口出现（导出任务提交后才会长出来）。返回 true/false，不抛错。 */
async function waitDownloadEntry(session, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const has = await session.evaluate(`!!document.querySelector('#downloadBalance-btn-0, [id^="downloadBalance-btn"]')`).catch(() => false);
    if (has) return true;
    // 导出历史列表偶尔要手动「查询」一下才刷新
    await session.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === '查询');
      if (b) { b.click(); return true; }
      return false;
    })()`).catch(() => false);
    await sleep(1500);
  }
  return false;
}

/**
 * 跑一份对账单下载。
 * @param variant 'goods'（货款） | 'deposit'（保证金） | 'overseas'（跨境对账单）
 */
export async function runBillStatement(session, { range, downloadDir, log = () => {}, variant = 'goods', store } = {}) {
  const startUrl = variant === 'overseas' ? URLS.mmsFinanceBills : URLS.cashierBills;

  await openPage(session, startUrl, { waitText: 600, timeoutMs: 35000 });
  const landed = await session.url();
  await assertAlive(session, { what: '对账中心' });
  log(`对账中心已打开：${landed}`);

  const onCashier = /cashier\.pinduoduo\.com/.test(landed);
  if (variant === 'overseas' && onCashier) {
    log('提示：这条配方是跨境店铺的财务流水页；当前店铺落到国内对账中心，按货款账户继续');
  }

  // 保证金账户要点一下 tab；货款账户是默认页
  if (variant === 'deposit' || (variant === 'goods' && !(await session.evaluate(`!!document.querySelector('#exportBalance-btn')`).catch(() => false)))) {
    const kind = KINDS[variant === 'deposit' ? 'deposit' : 'goods'];
    const switched = await clickTextAny(session, kind.tabText, {
      selector: '[data-testid="beast-core-tab-itemLabel"], [class*="tab-itemLabel"]', exact: false, timeoutMs: 8000, what: '账户 tab',
    }).catch(() => false);
    if (!switched) throw Object.assign(new Error(`找不到「${kind.tabText}」tab`), { code: 'TAB_NOT_FOUND', tab: kind.tabText });
    await sleep(2500);
  }

  const kind = KINDS[variant === 'deposit' ? 'deposit' : 'goods'];
  await assertAlive(session, { what: '对账中心' });

  // 选「上月整月」：range 由作业声明（last_month）
  const picked = await pickMonthRpr(session, { start: range.start, end: range.end, log });
  log(`区间 ${picked.start} ~ ${picked.end}（页面回显：${picked.inputValue || '(空)'}）`);
  await sleep(2000);

  // 有些页面选完会自动查，有些要再点一次「查询」：先看表格有没有数，没有就点查询
  let rows = await readTable(session, { maxRows: 5 });
  if (!rows.length) {
    const queried = await clickByText(session, '查询', { timeoutMs: 5000 }).catch(() => false);
    if (queried) { log('已点「查询」'); await sleep(2500); }
    rows = await readTable(session, { maxRows: 5 });
  }
  log(`表格 ${rows.length} 行${rows.length ? `（首行：${rows[0].slice(0, 4).join(' / ')}）` : '（可能是空数据）'}`);

  // 点「导出」：站点会把导出历史**开在一个新标签**里（同一页面有时只是原地排队），
  // 所以两种都要跟：先等新标签，没有就在原页点「导出历史」。
  const port = Number(store && store.port) || 0;
  const before = (await listPages(port).catch(() => [])).map((t) => t.id);
  await waitAndClick(session, kind.exportSel, { timeoutMs: 10000, what: '「导出」按钮' });
  log('已点「导出」，等导出历史的「下载账单」入口…');

  let work = session;
  let tabId = '';
  try {
    const tab = await waitForTab(port, /bills\/export-history/, { timeoutMs: 12000, exclude: before });
    work = new Session(tab.webSocketDebuggerUrl);
    tabId = tab.id;
    await work.navigate(tab.url, 1500);
    log(`导出历史（新标签）：${tab.url}`);
  } catch {
    log('没等到新标签，在原标签里点「导出历史」');
    const went = await session.evaluate(`(() => {
      const a = Array.from(document.querySelectorAll('a,span,div,button')).find((e) => (e.textContent || '').trim() === '导出历史' && e.getBoundingClientRect().width > 0);
      if (!a) return false;
      a.click();
      return true;
    })()`).catch(() => false);
    if (!went) throw Object.assign(new Error('点「导出」后既没开新标签，也找不到「导出历史」入口'), { code: 'EXPORT_HISTORY_MISSING' });
    await sleep(2500);
  }

  let file;
  try {
    if (!(await waitDownloadEntry(work, 40000))) {
      throw Object.assign(new Error('导出历史里没有出现「下载账单」入口（任务可能还在生成，或页面改版了）'), { code: 'EXPORT_NOT_READY' });
    }
    file = await downloadByClick(work, downloadDir || '', {
      expr: `document.querySelector('#downloadBalance-btn-0, [id^="downloadBalance-btn"]')`,
      what: '下载账单',
      log,
      timeoutMs: Number(process.env.RPA_DL_TIMEOUT) || 60000,
    });
  } finally {
    if (work !== session) { try { work.close(); } catch { /* ignore */ } }
    if (tabId) await closePage(port, tabId).catch(() => {});
  }
  log(`文件已落盘：${file.name}（${Math.round(file.size / 1024)} KB）`);

  return {
    range: { start: picked.start, end: picked.end, confirmed: picked.confirmed },
    file: { path: file.path, name: file.name, size: file.size },
    extra: { variant, landed, rows: rows.length },
  };
}
