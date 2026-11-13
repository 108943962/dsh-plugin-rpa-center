/**
 * 点一遍折叠/批量，断言「只有被点的那块变」，防止再出现「点一下整块都收起来」。
 * 依赖本机 9222 上的 Chrome（tools/peek.mjs 用的是同一个）。
 *
 *   cd tools/ui-test && pnpm install && pnpm test
 */
import { closePage, newPage, Session, sleep } from '../../lib/engine/cdp.mjs';

const PORT = Number(process.env.RPA_CDP_PORT) || 9222;
const dir = new URL('.', import.meta.url).pathname;
const page = await newPage(PORT, `file://${dir}index.html`);
const s = new Session(page.webSocketDebuggerUrl);
const ev = (e) => s.evaluate(e, 20000);

const folds = async () => JSON.parse(await ev(`JSON.stringify(Object.fromEntries(Array.from(document.querySelectorAll('details[data-fold]')).map(d => [d.dataset.fold, d.open])))`));
const click = async (expr) => {
  const pos = JSON.parse(await ev(`(() => {
    const el = ${expr};
    if (!el) return 'null';
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) });
  })()`));
  if (pos === null) throw new Error(`找不到元素：${expr}`);
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, 4000);
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, 4000);
  await sleep(350);
};

let bad = 0;
const checkSame = (name, got, want) => expect(name, got, want);
const expect = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}  ${JSON.stringify(got)}`);
  if (!ok) { bad += 1; console.log(`   期望 ${JSON.stringify(want)}`); }
};

try {
  // 清掉上次留下的折叠状态并等面板真的重新渲染好（reload 是异步的，等太久/太早都会误判）
  await ev('localStorage.clear(); location.reload(); true');
  for (let i = 0; i < 40; i += 1) {
    await sleep(200);
    const ready = await ev(`document.readyState === 'complete' && !!document.querySelector('details[data-fold="jobs"]')`).catch(() => false);
    if (ready) break;
  }
  await sleep(500);
  const base = await folds();
  expect('初始：折叠的只有运行计划', base, { plan: false, jobs: true, 'g:promotion': true, 'g:orders': true, 'g:finance': true, 'g:balance': true });

  await click(`document.querySelector('details[data-fold="g:orders"] summary span')`);
  expect('点「订单」只收订单，外层不跟着收', await folds(), { ...base, 'g:orders': false });

  await click(`document.querySelector('details[data-fold="g:orders"] summary span')`);
  expect('再点一次恢复展开', await folds(), base);

  await click(`document.querySelector('.rpa-job .rpa-job-name')`);
  expect('点作业标题不会误折叠', await folds(), base);

  await click(`document.querySelector('.rpa-job input[type=checkbox]')`);
  expect('点「批量」勾选不会误折叠', await folds(), base);

  await click(`document.querySelector('details[data-fold="jobs"] summary b')`);
  expect('点作业目录只收目录', await folds(), { ...base, jobs: false });

  await click(`document.querySelector('details[data-fold="jobs"] summary b')`);
  await click(`document.querySelector('details[data-fold="plan"] summary b')`);
  const planOpen = await folds();
  expect('点「运行计划」能展开', planOpen, { ...base, plan: true });

  await click(`document.querySelector('details[data-fold="plan"] summary button')`);
  expect('点「立即执行」不会折叠卡片', await folds(), planOpen);

  await click(`Array.from(document.querySelectorAll('details[data-fold="plan"] button')).find(b => b.textContent === '全选')`);
  expect('点「全选」不会折叠卡片', await folds(), planOpen);

  await click(`Array.from(document.querySelectorAll('details[data-fold="plan"] button')).find(b => b.textContent === '＋ 添加任务')`);
  expect('点「添加任务」不会折叠卡片', await folds(), planOpen);

  await click(`document.querySelector('details[data-fold="jobs"] summary select')`);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, 3000).catch(() => {});
  expect('点店铺下拉不会折叠', await folds(), planOpen);

  // 立即执行要二次确认：第一下只变成「确认执行？」，第二下才真跑
  await sleep(3200);   // 等前面那次点击的确认态过期
  const runBtn = `document.querySelector('details[data-fold="plan"] summary button')`;
  const runCalls = () => ev(`(window.__fetches || []).filter(u => u.includes('/rpa/schedule-run')).length`);
  const beforeRun = await runCalls();
  await click(runBtn);
  expect('第一下「立即执行」只改文案', await ev(`${runBtn}.textContent`), '确认执行？');
  expect('第一下不会真跑', await runCalls(), beforeRun);
  await click(runBtn);
  expect('第二下才真跑', await runCalls(), beforeRun + 1);
  expect('跑完按钮恢复', await ev(`${runBtn}.textContent`), '立即执行');

  await click(runBtn);
  expect('再点一次进入确认态', await ev(`${runBtn}.textContent`), '确认执行？');
  await sleep(3400);
  expect('3 秒不点自动取消', await ev(`${runBtn}.textContent`), '立即执行');

  // 登录门槛：模拟未登录时，只应该有登录提示卡，没有作业
  const gate = await newPage(PORT, `file://${dir}index.html?gate=1`);
  const gs = new Session(gate.webSocketDebuggerUrl);
  try {
    await sleep(1500);
    const gv = (e) => gs.evaluate(e, 20000);
    expect('未登录时显示登录提示', await gv(`(document.body.innerText || '').includes('需要先登录示例系统')`), true);
    expect('未登录时不显示作业列表', await gv(`document.querySelectorAll('.rpa-job').length`), 0);
    expect('未登录时不显示运行计划', await gv(`!!document.querySelector('details[data-fold="plan"]')`), false);
  } finally {
    gs.close();
    await closePage(PORT, gate.id).catch(() => {});
  }

} catch (err) {
  console.error('✗ 执行出错：', err && err.message ? err.message : err);
  bad += 1;
} finally {
  s.close();
  await closePage(PORT, page.id).catch(() => {});
}

console.log(bad ? `\n${bad} 项失败` : '\n界面点击检查通过');
process.exit(bad ? 1 : 0);
