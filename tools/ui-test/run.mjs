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
  expect('初始：折叠的只有本次运行和定时任务', base, { pick: false, schedule: false, jobs: true, 'g:promotion': true, 'g:orders': true, 'g:finance': true, 'g:balance': true });

  await click(`document.querySelector('details[data-fold="g:orders"] summary span')`);
  const afterOrder = await folds();
  expect('点「订单」只收订单，外层不跟着收', afterOrder, { ...base, 'g:orders': false });

  await click(`document.querySelector('details[data-fold="g:orders"] summary span')`);
  expect('再点一次恢复展开', await folds(), base);

  await click(`document.querySelector('.rpa-job .rpa-job-name')`);
  expect('点作业标题不会误折叠', await folds(), base);

  await click(`document.querySelector('.rpa-job input[type=checkbox]')`);
  expect('点「批量」勾选不会误折叠', await folds(), base);

  await click(`document.querySelector('details[data-fold="jobs"] summary b')`);
  expect('点作业目录只收目录', await folds(), { ...base, jobs: false });

  await click(`document.querySelector('details[data-fold="jobs"] summary b')`);
  await click(`document.querySelector('details[data-fold="schedule"] summary b')`);
  const schedOpen = await folds();
  checkSame('点「定时任务」能展开', schedOpen, { ...base, schedule: true });
  await click(`document.querySelector('details[data-fold="schedule"] summary button')`);
  checkSame('点「立即执行」不会把卡片折叠', await folds(), schedOpen);
  await click(`document.querySelector('details[data-fold="schedule"] summary b')`);

  await click(`document.querySelector('details[data-fold="pick"] summary b')`);
  const pickOpen = await folds();
  await click(`Array.from(document.querySelectorAll('details[data-fold="pick"] summary button')).find(b => b.textContent === '全选')`);
  expect('点摘要里的「全选」不会折叠', await folds(), pickOpen);

  await click(`document.querySelector('details[data-fold="jobs"] summary select')`);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, 3000).catch(() => {});
  expect('点店铺下拉不会折叠', await folds(), pickOpen);
} catch (err) {
  console.error('✗ 执行出错：', err && err.message ? err.message : err);
  bad += 1;
} finally {
  s.close();
  await closePage(PORT, page.id).catch(() => {});
}

console.log(bad ? `\n${bad} 项失败` : '\n界面点击检查通过');
process.exit(bad ? 1 : 0);
