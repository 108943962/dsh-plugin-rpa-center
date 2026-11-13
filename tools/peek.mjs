/**
 * 开发者用的小工具：连店铺 Chrome，开一个临时标签，跑一段页面表达式看结果。
 * 只读：不点任何按钮（除非表达式自己点），跑完关掉标签。
 *
 *   node tools/peek.mjs <url> 'document.title'            # 表达式直接给
 *   node tools/peek.mjs <url> -f probe.js                 # 表达式写文件里（长的用它）
 *   选项：--port 9222  --wait 6000  --keep（不关标签）  --settle 500
 */
import fs from 'node:fs';
import { closePage, newPage, Session, sleep } from '../lib/engine/cdp.mjs';

const argv = process.argv.slice(2);
const opt = { port: 9222, wait: 8000, keep: false, settle: 500 };
const rest = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--port') opt.port = Number(argv[++i]);
  else if (a === '--wait') opt.wait = Number(argv[++i]);
  else if (a === '--settle') opt.settle = Number(argv[++i]);
  else if (a === '--keep') opt.keep = true;
  else if (a === '--expr-file') opt.exprFile = argv[++i];
  else if (a === '-f') opt.exprFile = argv[++i];
  else rest.push(a);
}

const url = rest[0];
const expr = opt.exprFile ? fs.readFileSync(opt.exprFile, 'utf8') : rest[1];
if (!url || !expr) {
  console.error('用法: node tools/peek.mjs <url> <expression> | -f file [--port 9222] [--wait 8000] [--keep]');
  process.exit(2);
}

const page = await newPage(opt.port, 'about:blank');
const session = new Session(page.webSocketDebuggerUrl);
try {
  await session.navigate(url, 1500);
  const deadline = Date.now() + opt.wait;
  let last = '';
  for (;;) {
    const info = await session.evaluate('JSON.stringify({u: location.href, n: (document.body ? document.body.innerText.length : 0)})').catch(() => null);
    last = info || '';
    try {
      const { u, n } = JSON.parse(info || '{}');
      if (u && u !== 'about:blank' && n > 200) break;
    } catch { /* ignore */ }
    if (Date.now() >= deadline) break;
    await sleep(400);
  }
  await sleep(opt.settle);
  const where = await session.evaluate('location.href').catch(() => '?');
  const len = await session.evaluate('document.body ? document.body.innerText.length : 0').catch(() => 0);
  console.error(`[peek] url=${where} textLen=${len}`);
  const out = await session.evaluate(expr);
  if (typeof out === 'string') process.stdout.write(`${out}\n`);
  else process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} finally {
  session.close();
  if (!opt.keep) await closePage(opt.port, page.id).catch(() => {});
}
