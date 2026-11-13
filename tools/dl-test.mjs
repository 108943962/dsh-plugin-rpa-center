/**
 * 下载捕获的回归测试（不需要浏览器）：
 *   - 站点用固定文件名**原地覆盖**时，必须认成「这次的新文件」
 *   - 平白无故不该把老文件当新文件
 *   - downloadByClick 每次运行落在新的 dl-xxx 子目录里，同一次运行里重复下载不会互相覆盖
 *
 *   node tools/dl-test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureDownload, snapshotDownloads } from '../lib/engine/cdp.mjs';
import { downloadByClick } from '../lib/jobs/common.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpa-dl-'));
let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) bad += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 同名文件原地覆盖：基线里有 a.xls，随后内容被重写 → 必须捕获
{
  const dir = path.join(root, 'overwrite');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, '固定文件名.xls');
  fs.writeFileSync(f, 'old');
  const past = Date.now() - 60000;
  fs.utimesSync(f, past / 1000, past / 1000);
  const baseline = snapshotDownloads(dir);
  const since = Date.now();
  const p = captureDownload(null, dir, { timeoutMs: 4000, since, baseline });
  await sleep(600);
  fs.writeFileSync(f, 'new-content-longer');
  try {
    const got = await p;
    check('同名文件原地覆盖能捕获', got.name === '固定文件名.xls', `${got.size}B`);
  } catch (err) {
    check('同名文件原地覆盖能捕获', false, err.code);
  }
}

// 2) 老文件不动 → 必须超时，不能误判成新文件
{
  const dir = path.join(root, 'stale');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'old.xls'), 'old');
  const baseline = snapshotDownloads(dir);
  try {
    await captureDownload(null, dir, { timeoutMs: 1500, since: Date.now(), baseline });
    check('没变化的老文件不会被当成下载', false);
  } catch (err) {
    check('没变化的老文件不会被当成下载', err.code === 'DOWNLOAD_TIMEOUT');
  }
}

// 3) downloadByClick：落在 dl-xxx 子目录（每次运行独立，固定文件名也不会互相踩）
{
  const base = path.join(root, 'job');
  fs.mkdirSync(base, { recursive: true });
  let currentDir = '';
  const writeFile = () => {
    fs.mkdirSync(currentDir, { recursive: true });
    fs.writeFileSync(path.join(currentDir, '报表.xls'), 'x'.repeat(1024));
    return true;
  };
  const fakeSession = {
    async setDownloadDir(d) { currentDir = d; },
    async click() { return writeFile(); },
    async evaluate() { return writeFile(); },
  };
  const f1 = await downloadByClick(fakeSession, base, { expr: 'null', what: '测试', mouseFirst: false, timeoutMs: 3000 });
  check('downloadByClick 落在 dl- 子目录', /\/dl-[a-z0-9]+\//.test(f1.path), path.relative(base, f1.path));
  check('文件名保持站点原名', f1.name === '报表.xls', f1.name);

  const f2 = await downloadByClick(fakeSession, base, { expr: 'null', what: '测试', mouseFirst: false, timeoutMs: 3000 });
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('dl-'));
  check('每次运行一个新子目录', dirs.length === 2, dirs.join(','));
  check('两次运行互不覆盖', f1.path !== f2.path);
}

fs.rmSync(root, { recursive: true, force: true });
console.log(bad ? `\n${bad} 项失败` : '\n下载捕获检查通过');
process.exit(bad ? 1 : 0);
