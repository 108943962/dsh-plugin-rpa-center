/**
 * 财务类作业：把「财务流水明细」下载下来。
 * 区间由作业声明（上月整月 / 近 30 天 / 指定区间）。
 *
 * 流程与验证过的探针保持一致（顺序很关键，踩过坑）：
 *   打开页面 → 选日期 → **选完再设下载目录** → 查询 → 等明细表 → 点下载 → 收文件
 * 两个已知坑：
 *   1) 下载目录必须在点「下载明细」前设好，但不能早到选日期之前（否则导出会落到系统「下载」）；
 *   2) 点下载前先给目录拍快照，文件可能几百毫秒就落盘，晚拍会把它当「本来就有的」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { captureDownload, sleep, snapshotDownloads } from '../engine/cdp.mjs';
import { clickByText, dismissOverlays, openPage, pickRange, URLS } from './common.mjs';

export async function runFinanceStatement(session, { range, downloadDir, log = () => {} } = {}) {
  await openPage(session, URLS.finance, { waitText: 700, timeoutMs: 30000 });
  log('财务流水页已打开');

  const picked = await pickRange(session, {
    start: range.start,
    end: range.end,
    opener: `document.querySelector('input[placeholder="开始日期"]')`,
    log,
  });
  log(`区间 ${picked.start} ~ ${picked.end}（页面回显：${picked.inputs.join(' | ')}）`);

  // 每次运行一个**新子目录**：同名文件已存在时 Chrome 会改名/跳过，
  // 反复跑同一个作业就永远等不到「新文件」（踩过）。新目录保证每次都是干净的。
  const baseDir = downloadDir || path.join(process.env.DSH_HOME || path.join(process.env.HOME || '.', '.dsh'), 'rpa-center', 'raw', 'manual');
  const dir = path.join(baseDir, `dl-${Date.now().toString(36)}`);
  fs.mkdirSync(dir, { recursive: true });
  await session.setDownloadDir(dir).catch((err) => log(`提示：下载目录设置被拒（${err.code || err.message}），将用系统「下载」兜底`));

  await clickByText(session, '查询', { timeoutMs: 8000 });
  await sleep(2500);
  await session.waitFor(`(document.body.innerText || '').includes('明细数据')`, { timeoutMs: 12000, what: '明细数据表' });

  const baseline = snapshotDownloads(dir);
  const since = Date.now();
  await clickByText(session, '下载明细', { timeoutMs: 10000 });
  log('已点「下载明细」，等文件落盘…');

  let file;
  try {
    file = await captureDownload(session, dir, { timeoutMs: 12000, since, baseline });
  } catch {
    // 鼠标点击被残留遮罩吞掉时（选过日期后偶发），用 DOM 点击再触发一次
    log('鼠标点击没触发下载，改用 DOM 点击重试');
    const ok = await session.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === '下载明细');
      if (!b) return false;
      b.click();
      return true;
    })()`).catch(() => false);
    if (!ok) throw Object.assign(new Error('找不到「下载明细」按钮'), { code: 'BUTTON_NOT_FOUND' });
    file = await captureDownload(session, dir, { timeoutMs: Number(process.env.RPA_DL_TIMEOUT) || 45000, since: Date.now(), baseline });
  }
  log(`文件已落盘：${file.name}（${Math.round(file.size / 1024)} KB）`);

  return {
    range: { start: picked.start, end: picked.end, confirmed: picked.confirmed },
    file: { path: file.path, name: file.name, size: file.size },
  };
}
