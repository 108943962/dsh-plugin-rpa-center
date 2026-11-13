/**
 * 两个任务共用的页面动作。
 * 这里是「Automa 老流程为什么总在某个环节出错」的正面回答：
 * 每一步都有超时与明确的错误码，且日期面板用真实点击（不是注入 JS 直接 .click()）。
 */
import fs from 'node:fs';
import { captureDownload, snapshotDownloads, sleep } from '../engine/cdp.mjs';

export const URLS = {
  promotion: 'https://yingxiao.pinduoduo.com/mains/promotionOverview',
  finance: 'https://yingxiao.pinduoduo.com/mains/account/report',
  home: 'https://mms.pinduoduo.com/home/',
  // ── RPA 中心新增（对应 Automa 那 10 份日常流程）────────────────────────────
  /** 推广报表 → 商品推广总览：Automa 里「推广概况 → 选区间 → 导出/下载」那两步的真身 */
  adsReport: 'https://yingxiao.pinduoduo.com/goods/report/promotion/overView',
  /** 推广账户（月账单表：月份/本月余额/上月余额/本月收入/本月支出） */
  adsAccount: 'https://yingxiao.pinduoduo.com/mains/account/finance',
  /** 对账中心（货款 tab）：从 mms 走一次 SSO 才拿得到登录态，直连 cashier 会「登录异常」 */
  cashierBills: 'https://mms.pinduoduo.com/cashier/finance/payment-bills',
  /** 对账中心（跨境店铺走这条） */
  mmsFinanceBills: 'https://mms.pinduoduo.com/finance/payment-bills/index',
  /** 订单查询 */
  mmsOrders: 'https://mms.pinduoduo.com/orders/list',
};


/**
 * 关掉挡路的弹层。
 * 站内经常弹「新手引导 / 活动 / 公告 / 权限提示」，它们盖在日期面板上，
 * 表现就是「点开日期面板但看不到日期格子」→ DATE_CELL_MISSING。
 * 策略：先按 Esc，再点可见的关闭按钮；最后把还在的全屏遮罩点掉（只点遮罩本身）。
 */
const CLOSERS = [
  '[class*="modal"] [class*="close"]',
  '[class*="Modal"] [class*="close"]',
  '[class*="dialog"] [class*="close"]',
  '[class*="Popup"] [class*="close"]',
  '[class*="popup"] [class*="close"]',
  '[class*="Guide"] [class*="close"]',
  '[class*="guide"] [class*="close"]',
  '.anq-modal-close',
  '[aria-label="关闭"]',
  '[aria-label="Close"]',
  '[class*="closeIcon"]',
  '[class*="close-icon"]',
];

async function pressEscape(session) {
  try {
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, 4000);
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, 4000);
  } catch { /* ignore */ }
}

/** 可见遮罩的数量（>=1 说明还有东西盖着页面）。 */
function maskProbe(session) {
  return session.evaluate(`(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const nodes = Array.from(document.querySelectorAll('[class*="mask"],[class*="Mask"],[class*="overlay"],[class*="Overlay"]'));
    let n = 0;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      if (r.width >= vw * 0.6 && r.height >= vh * 0.4) n += 1;
    }
    return n;
  })()`).catch(() => 0);
}

export async function dismissOverlays(session, { rounds = 3, log = () => {} } = {}) {
  let closed = 0;
  for (let round = 0; round < rounds; round += 1) {
    const before = await maskProbe(session);
    await pressEscape(session);
    await sleep(250);

    // 点可见的关闭按钮（每个选择器只点一次，避免误点）
    for (const sel of CLOSERS) {
      const clicked = await session.click(`(() => {
        const list = Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
        return list.find((el) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0;
        }) || null;
      })()`).catch(() => false);
      if (clicked) { closed += 1; await sleep(300); }
    }

    const after = await maskProbe(session);
    if (after === 0 && before === 0) break;
    if (after === 0) { log('弹层已关闭'); break; }
    // 还有遮罩但没有关闭按钮：点遮罩本身（很多站点点蒙层即关闭）
    const tapped = await session.click(`(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      return Array.from(document.querySelectorAll('[class*="mask"],[class*="Overlay"],[class*="overlay"]')).find((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width >= vw * 0.6 && r.height >= vh * 0.4 && st.display !== 'none' && st.visibility !== 'hidden';
      }) || null;
    })()`).catch(() => false);
    if (tapped) { closed += 1; await sleep(350); }
  }
  const remaining = await maskProbe(session);
  if (remaining > 0) log(`注意：仍有 ${remaining} 个遮罩未关闭，接下来可能点不到目标`);
  return { closed, remaining };
}

/** 打开一个页面并等到「页面上有内容」；登录态失效时给 LOGIN_REQUIRED。 */
export async function openPage(session, url, { waitText = 600, timeoutMs = 25000 } = {}) {
  await session.navigate(url, 1200);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const u = await session.url().catch(() => '');
    if (/\/login|login\.pinduoduo|passport/i.test(u)) {
      throw Object.assign(new Error(`登录态失效：页面停在 ${u}。请在「打开店铺」里重新登录一次`), { code: 'LOGIN_REQUIRED', url: u });
    }
    const len = Number(await session.evaluate('document.body ? document.body.innerText.length : 0').catch(() => 0)) || 0;
    if (len >= waitText) return { url: u, textLength: len };
    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`页面 ${url} 加载超时（正文 ${len} 字）`), { code: 'PAGE_TIMEOUT', url: u });
    }
    await sleep(500);
  }
}

/**
 * 页面可能同时开着多个日期面板（主区间 + 对比区间）。
 * 只点某一个面板的「上个月」经常点错面板 → 目标日期永远不出现。
 * 这里每轮把**所有可见面板**的上月箭头都点一次，再检查目标日期。
 */
const VISIBLE_PANELS = `Array.from(document.querySelectorAll('[class*="picker-panel"]')).filter((p) => {
  const r = p.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
})`;

const prevBtnExpr = (idx) => `(() => {
  const vis = ${VISIBLE_PANELS};
  const panel = vis[${idx}];
  if (!panel) return null;
  const btn = panel.querySelector('[class*="header-prev-btn"]');
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? btn : null;
})()`;

async function ensureCell(session, isoDate, { tries = 5, log = () => {} } = {}) {
  const has = () => session.evaluate(`!!document.querySelector('td[title="${isoDate}"]')`).catch(() => false);
  if (await has()) return;
  for (let round = 0; round < tries; round += 1) {
    const panelCount = Number(await session.evaluate(`${VISIBLE_PANELS}.length`).catch(() => 0)) || 0;
    if (!panelCount) throw Object.assign(new Error('日期面板没打开'), { code: 'PICKER_NOT_FOUND' });
    let moved = 0;
    for (let idx = 0; idx < Math.min(panelCount, 3); idx += 1) {
      const ok = await session.click(prevBtnExpr(idx)).catch(() => false);
      if (ok) moved += 1;
    }
    await sleep(400);
    if (await has()) return;
    if (!moved) break;
    log(`翻到上个月（第 ${round + 1} 次）`);
  }
  throw Object.assign(new Error(`日期面板里找不到 ${isoDate}（面板没打开，或页面改版）`), { code: 'DATE_CELL_MISSING' });
}

/**
 * 在日期面板里选一段区间。
 * @param opener 打开面板的表达式（不同页面点的地方不一样）
 */
export async function pickRange(session, { start, end, opener, log = () => {} }) {
  const s = String(start).replace(/-/g, '/');
  const e = String(end).replace(/-/g, '/');
  const iso = { start: String(start), end: String(end) };

  // 弹层是这里最常见的事故源：先清场，清完再点
  const before = await dismissOverlays(session, { log });
  if (before.closed) log(`关掉了 ${before.closed} 个弹层`);

  const openPicker = async () => {
    const ok = await session.click(opener);
    await sleep(800);
    return ok;
  };
  if (!(await openPicker())) {
    await dismissOverlays(session, { log });
    if (!(await openPicker())) {
      throw Object.assign(new Error('点不开日期面板（可能被弹层挡住，或选择器变了）'), { code: 'PICKER_NOT_FOUND' });
    }
  }

  // 注意：这里**不能再按 Esc 清场**——Esc 会把刚打开的日期面板关掉。
  // 面板没展开就再点一次选择器（幂等）。
  const hasCell = (isoDate) => session.evaluate(`!!document.querySelector('td[title="${isoDate}"]')`).catch(() => false);
  if (!(await hasCell(iso.start))) {
    // 注意：再点一次选择器会**把面板关掉**（toggle），所以只在面板确实没开时才补点
    const openCount = Number(await session.evaluate(`${VISIBLE_PANELS}.length`).catch(() => 0)) || 0;
    if (openCount === 0) {
      log('日期面板没展开，再点一次');
      await openPicker();
    }
  }

  await ensureCell(session, iso.start, { log });
  if (!(await session.click(`document.querySelector('td[title="${iso.start}"]')`))) {
    throw Object.assign(new Error(`点不到开始日期 ${iso.start}`), { code: 'DATE_CLICK_FAILED' });
  }
  await sleep(500);

  await ensureCell(session, iso.end, { log });
  if (!(await session.click(`document.querySelector('td[title="${iso.end}"]')`))) {
    throw Object.assign(new Error(`点不到结束日期 ${iso.end}`), { code: 'DATE_CLICK_FAILED' });
  }
  await sleep(600);

  // 选完读回输入框，确认真的生效（不生效就在这里失败，不把错数据带下去）
  const shown = await session.evaluate(`JSON.stringify(Array.from(document.querySelectorAll('input[placeholder*="日期"]')).map(i => i.value))`).catch(() => '[]');
  let values = [];
  try { values = JSON.parse(shown || '[]'); } catch { /* ignore */ }
  const okStart = values.some((v) => String(v).replace(/\s/g, '').startsWith(s));
  const okEnd = values.some((v) => String(v).replace(/\s/g, '').startsWith(e));
  return { start: iso.start, end: iso.end, inputs: values, confirmed: okStart && okEnd };
}

/** 按可见文字点一个按钮。 */
export async function clickByText(session, text, { tag = 'button', timeoutMs = 8000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const clicked = await session.click(`Array.from(document.querySelectorAll('${tag}')).find((b) => (b.textContent || '').trim() === ${JSON.stringify(text)})`);
    if (clicked) return true;
    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`找不到「${text}」按钮（${timeoutMs}ms）`), { code: 'BUTTON_NOT_FOUND' });
    }
    await sleep(400);
  }
}

// ── 以下是「RPA 中心」这批日常流程（原 Automa）共用的页面动作 ─────────────────
//
// 设计取舍：Automa 用 nth-child 链定位按钮，站点一改版就断；这里尽量用
// 「可见文字 + data-testid 前缀」定位，并给每一步明确的错误码。

/**
 * 登录态 / 验证码守卫。
 * Automa 里那套是：发现 div.vertify-subtitle 就发短信让别人填验证码（还睡 40-60 秒）。
 * 本插件复用店铺自己的 Chrome 档案，登录一次长期有效；真掉登录或弹验证码时**如实报错**，
 * 让用户去「打开店铺」手动过一次，而不是卡在那里等一个不会来的验证码。
 */
export async function assertAlive(session, { what = '页面' } = {}) {
  const probe = await session.evaluate(`JSON.stringify((() => {
    const text = (document.body ? document.body.innerText : '').slice(0, 400);
    const captcha = !!document.querySelector('div.vertify-subtitle, [class*="vertify"], [class*="captcha"]');
    const loginPage = /扫码登录|请登录|登录异常|账号登录/.test(text);
    return { captcha, loginPage, url: location.href, head: text.slice(0, 120).replace(/\\n+/g, ' ') };
  })())`).catch(() => null);
  let info = {};
  try { info = JSON.parse(probe || '{}'); } catch { /* ignore */ }
  if (info.loginPage || info.captcha) {
    const why = info.loginPage ? '停在登录页/登录异常' : '弹出了验证码';
    throw Object.assign(new Error(`${what}${why}（${info.url || ''}）：请在「打开店铺」里手动登录/过验证码后重试`), {
      code: 'LOGIN_REQUIRED', url: info.url || '',
    });
  }
  return info;
}

/** 等元素出现再真实点击；超时给 ELEMENT_NOT_FOUND（带 what，便于定位是哪一步）。 */
export async function waitAndClick(session, expr, { timeoutMs = 12000, what = '元素', log = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await session.click(expr).catch(() => false);
    if (ok) return true;
    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`点不到${what}（${timeoutMs}ms）`), { code: 'ELEMENT_NOT_FOUND', what });
    }
    await sleep(400);
  }
}

/** 按文字点任意标签（label/span/div/a 都行，不限于 button）。 */
export async function clickTextAny(session, text, { selector = 'button,label,span,a,div,li', exact = true, timeoutMs = 10000, what = '' } = {}) {
  const deadline = Date.now() + timeoutMs;
  const body = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter((el) => {
    const t = (el.textContent || '').trim();
    return ${exact ? `t === ${JSON.stringify(text)}` : `t.length <= 20 && t.includes(${JSON.stringify(text)})`};
  }).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
   .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)[0]`;
  for (;;) {
    const ok = await session.click(body).catch(() => false);
    if (ok) return true;
    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`找不到「${text}」${what || '入口'}（${timeoutMs}ms）`), { code: 'BUTTON_NOT_FOUND', text });
    }
    await sleep(400);
  }
}

/** 表格读成二维数组：优先 beast-core 的 td/tr，退化成原生 table。 */
export async function readTable(session, { maxRows = 40 } = {}) {
  const raw = await session.evaluate(`JSON.stringify((() => {
    const rows = Array.from(document.querySelectorAll('[data-testid="beast-core-table-body-tr"]'));
    const use = rows.length ? rows : Array.from(document.querySelectorAll('table tbody tr'));
    const pick = use.slice(0, ${Number(maxRows) || 40}).map((tr) => {
      const cells = tr.querySelectorAll('[data-testid="beast-core-table-td"]');
      const list = cells.length ? Array.from(cells) : Array.from(tr.children);
      return list.map((td) => (td.innerText || td.textContent || '').replace(/\\s+/g, ' ').trim());
    });
    return pick.filter((r) => r.some(Boolean));
  })())`).catch(() => '[]');
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

/** 表格表头（没有就返回空数组，调用方按列序兜底）。 */
export async function readTableHead(session) {
  const raw = await session.evaluate(`JSON.stringify((() => {
    const th = Array.from(document.querySelectorAll('[data-testid="beast-core-table-head-tr"]'));
    if (th.length) return Array.from(th[0].querySelectorAll('[data-testid="beast-core-table-th"]')).map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim());
    const t = document.querySelector('table thead tr');
    return t ? Array.from(t.children).map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim()) : [];
  })())`).catch(() => '[]');
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

/**
 * 点一下、等文件落盘。
 * 顺序很关键（踩过）：先把下载目录设好、拍基线，再点 —— 文件可能 200ms 就落盘。
 */
export async function downloadByClick(session, dir, { expr, timeoutMs = Number(process.env.RPA_DL_TIMEOUT) || 45000, log = () => {}, what = '下载', mouseFirst = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  await session.setDownloadDir(dir).catch((err) => log(`提示：下载目录设置被拒（${err.code || err.message}），将用系统「下载」兜底`));
  const baseline = snapshotDownloads(dir);
  const since = Date.now();
  const domClick = () => session.evaluate(`(() => { const el = ${expr}; if (!el) return false; el.click(); return true; })()`).catch(() => false);

  // 有些站点（订单导出记录页）被站点弹层/动画挡住时，真实鼠标事件会卡住 Input 通道，
  // 表现是点击本身超时。这类页面直接走 DOM 点击更稳，所以给个 mouseFirst=false。
  let clicked = false;
  if (mouseFirst) clicked = await session.click(expr).catch(() => false);
  if (!clicked) clicked = await domClick();
  if (!clicked) throw Object.assign(new Error(`点不到「${what}」按钮`), { code: 'BUTTON_NOT_FOUND', what });

  try {
    return await captureDownload(session, dir, { timeoutMs, since, baseline });
  } catch (err) {
    log(`这次点击没触发${what}，再点一次重试`);
    const again = await domClick();
    if (!again) throw err;
    // 第二次给足时间：有些站点的下载接口第一次只是「热身」
    return captureDownload(session, dir, { timeoutMs: Math.max(timeoutMs, 60000), since: Date.now(), baseline });
  }
}

// ── 对账中心（cashier）的 RPR 月份区间面板 ────────────────────────────────────
//
// Automa 的做法是「点第一个文本为 1 的格子，再点它前面那个格子」——靠相邻关系表达
// 「上月 1 号 ~ 上月末」。这里改成按 header 上的年月找对应面板，再点具体某天，
// 跨年、面板翻页都稳；找不到就点左箭头翻月，而不是默默点错。
const RPR_HEAD = 'div[class*="RPR_headerSelector_"]';
const RPR_TABLE = 'table[data-testid="beast-core-rangePicker-table"]';

const monthLabelOf = (iso) => {
  const [y, m] = String(iso).split('-').map(Number);
  return `${y}年${m}月`;
};

async function rprOpen(session) {
  return Boolean(await session.evaluate(`document.querySelectorAll('${RPR_HEAD}').length > 0`).catch(() => false));
}

/**
 * 在对账中心选「整月」区间（起止都给 YYYY-MM-DD）。
 * 面板一次显示两个月；目标月份不在视图里就点左箭头翻。
 */
export async function pickMonthRpr(session, { start, end, log = () => {} }) {
  const opener = `document.querySelector('input[data-testid="beast-core-rangePicker-htmlInput"]')`;
  await dismissOverlays(session, { log });
  if (!(await session.click(opener))) {
    throw Object.assign(new Error('点不开日期面板（选择器变了，或被弹层挡住）'), { code: 'PICKER_NOT_FOUND' });
  }
  await sleep(900);
  if (!(await rprOpen(session))) {
    throw Object.assign(new Error('日期面板没展开'), { code: 'PICKER_NOT_FOUND' });
  }

  const pick = async (iso, what) => {
    const label = monthLabelOf(iso);
    const day = String(Number(String(iso).slice(8)));
    for (let round = 0; round < 10; round += 1) {
      const heads = await session.evaluate(`JSON.stringify(Array.from(document.querySelectorAll('${RPR_HEAD}')).map((h) => (h.textContent || '').trim()))`).catch(() => '[]');
      let list = [];
      try { list = JSON.parse(heads || '[]'); } catch { /* ignore */ }
      const idx = list.findIndex((t) => t === label || t.endsWith(label));
      if (idx >= 0) {
        const ok = await session.click(`(() => {
          const tables = Array.from(document.querySelectorAll('${RPR_TABLE}'));
          const table = tables[${idx}] || tables[0];
          if (!table) return null;
          const cells = Array.from(table.querySelectorAll('td'));
          return cells.find((td) => {
            const inner = td.querySelector('div[class*="RPR_cell"]');
            if (!inner || /outOfMonth/.test(inner.className)) return false;
            return (inner.textContent || '').trim() === ${JSON.stringify(day)};
          }) || null;
        })()`).catch(() => false);
        if (ok) { await sleep(450); return true; }
        await dismissOverlays(session, { log });
        continue;
      }
      const moved = await session.click(`document.querySelector('svg[data-testid="beast-core-icon-left"]')`);
      if (!moved) {
        throw Object.assign(new Error(`日期面板里翻不到 ${label}（当前可见：${list.join(' / ') || '未知'}）`), { code: 'DATE_CELL_MISSING', visibleMonths: list });
      }
      await sleep(450);
    }
    throw Object.assign(new Error(`点不到${what} ${iso}`), { code: 'DATE_CLICK_FAILED', date: iso });
  };

  await pick(start, '开始日期');
  await pick(end, '结束日期');

  // 面板可能还开着：点面板里的「确认」收尾（有些页面两个日期点完会自动关）
  if (await rprOpen(session)) {
    const confirmed = await session.click(`Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '确认' && b.getBoundingClientRect().width > 0)`).catch(() => false);
    if (confirmed) await sleep(600);
    log(confirmed ? '已点面板「确认」' : '面板未关但没有「确认」按钮，忽略');
  }

  const shown = await session.evaluate(`JSON.stringify((document.querySelector('input[data-testid="beast-core-rangePicker-htmlInput"]') || {}).value || '')`).catch(() => '""');
  let inputValue = '';
  try { inputValue = JSON.parse(shown || '""'); } catch { /* ignore */ }
  const flat = String(inputValue).replace(/\s/g, '');
  return {
    start, end, inputValue,
    confirmed: flat.startsWith(String(start)) && flat.includes(String(end)),
  };
}
