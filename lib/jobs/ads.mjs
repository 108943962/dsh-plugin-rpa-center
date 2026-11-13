/**
 * 推广报表类作业 —— 推广报表（商品推广总览）选区间 → 下载明细。
 *
 * 对应原来的 2 份 Automa：
 *   5. pdd-商品推广月(start)   → 本月 1 号 → 今天
 *   6. pdd-月推广数据-月(start) → 上月 1 号 → 今天
 *
 * 这两份流程在 Automa 里点的是「推广概况」菜单 + 一堆 nth-child 按钮，「导出」按钮
 * 其实在**推广报表页**（/goods/report/promotion/overView）上：那里才有
 * 「今日/昨日/过去7日/…」快选、日期面板，以及右上角「下载」。
 */
import { downloadByClick } from './common.mjs';
import { assertAlive, openPage, pickRange, URLS } from './common.mjs';
import { sleep } from '../engine/cdp.mjs';

const DOWNLOAD_BTN = `Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '下载')`;

export async function runAdsReport(session, { range, downloadDir, log = () => {} } = {}) {
  await openPage(session, URLS.adsReport, { waitText: 1200, timeoutMs: 40000 });
  await assertAlive(session, { what: '推广报表页' });
  log('推广报表（商品推广总览）已打开');

  const picked = await pickRange(session, {
    start: range.start,
    end: range.end,
    // 这个页面有两个 picker（主区间 + 对比区间），必须点主区间的「开始日期」输入框，
    // 点 div.anq-picker 容器会开到对比面板上去（踩过）
    opener: `document.querySelectorAll('input[placeholder="开始日期"]')[0]`,
    log,
  });
  log(`区间 ${picked.start} ~ ${picked.end}${picked.confirmed ? '（页面已回显）' : '（页面没回显，继续按已知区间下载）'}`);
  await sleep(2500);

  let file;
  let source = '下载';
  try {
    file = await downloadByClick(session, downloadDir || '', {
      expr: DOWNLOAD_BTN,
      what: '下载',
      log,
      mouseFirst: false,
      timeoutMs: Number(process.env.RPA_DL_TIMEOUT) || 30000,
    });
  } catch (err) {
    // 有的版本主「下载」不落盘，真正能拿到文件的是「下载分天数据」
    log(`「下载」没拿到文件（${err.code || err.message}），改试「下载分天数据」`);
    source = '下载分天数据';
    file = await downloadByClick(session, downloadDir || '', {
      expr: `Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '下载分天数据')`,
      what: '下载分天数据',
      log,
      mouseFirst: false,
      timeoutMs: Number(process.env.RPA_DL_TIMEOUT) || 60000,
    });
  }
  log(`文件已落盘：${file.name}（${Math.round(file.size / 1024)} KB）`);

  return {
    range: { start: picked.start, end: picked.end, confirmed: picked.confirmed },
    file: { path: file.path, name: file.name, size: file.size },
    extra: { page: 'goods/report/promotion/overView', source },
  };
}
