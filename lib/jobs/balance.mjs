/**
 * 账户余额类作业 —— 读「月汇总 / 月账单」表格，落成指标台账（不是文件）。
 *
 * 覆盖三张表：
 *   对账中心「货款账户 · 月汇总」（国内 / 跨境各一条作业）
 *   推广账户「财务流水 · 月账单」
 *
 * 不逐格取文本，而是直接读整张表 → 拍平成指标（label 带月份前缀），进 metrics.csv 台账，
 * 每天跑一次就自然成了时间序列。
 */
import { sleep } from '../engine/cdp.mjs';
import { assertAlive, clickTextAny, openPage, readTable, readTableHead, URLS } from './common.mjs';

/** 表格里的金额/笔数：去千分位与正负号，认得「万/亿」。 */
export function toNumber(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return '';
  const m = text.match(/^([+-]?[\d,]+(?:\.\d+)?)\s*(万|亿)?/);
  if (!m) return text;
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return text;
  if (m[2] === '万') n *= 10000;
  if (m[2] === '亿') n *= 100000000;
  return n;
}

const slug = (label) => String(label)
  .replace(/[（(].*?[）)]/g, '')
  .replace(/\s+/g, '')
  .replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '');

/** 表头里这些列是「算式符号」，不当指标。 */
const IGNORED = new Set(['', '=', '+', '-', '查看明细', '操作', '资金类型', '账务类型', '资金流向']);

/**
 * 表格 → 指标：[{ key, label, value, month }]
 * 第一列当月份；其余列按表头命名（表头缺失时用 col2/col3…）。
 */
export function rowsToMetrics(rows, heads) {
  const cols = [];
  for (let i = 1; i < (heads.length || 12); i += 1) {
    const h = String(heads[i] || '').trim();
    if (IGNORED.has(h)) continue;
    cols.push({ index: i, name: h || `第${i + 1}列` });
  }
  const out = [];
  for (const row of rows) {
    const month = String(row[0] || '').trim();
    if (!month) continue;
    const range = month.match(/\d{4}-\d{2}|\d{4}\/\d{2}/);
    const monthKey = range ? range[0].replace('/', '-') : month.slice(0, 10);
    for (const col of cols) {
      const raw = row[col.index];
      if (raw === undefined) continue;
      out.push({
        key: `${monthKey}.${slug(col.name)}`,
        label: `${month} · ${col.name}`,
        value: toNumber(raw),
        month: monthKey,
      });
    }
  }
  return out;
}

/** 对账中心的「月汇总」：货款账户默认页里点 #monthly-detail，跨境店铺点同名 tab。 */
async function readCashierMonthly(session, { log }) {
  const isMonthly = () => session.evaluate(`document.body ? document.body.innerText.includes('月汇总') : false`).catch(() => false);
  if (!(await isMonthly())) throw Object.assign(new Error('对账中心页没打开'), { code: 'PAGE_NOT_READY' });

  const clicked = await clickTextAny(session, '月汇总', {
    selector: '[data-testid="beast-core-tab-itemLabel"]', exact: true, timeoutMs: 8000, what: '「月汇总」tab',
  }).catch(() => session.click(`document.querySelector('#monthly-detail')`).catch(() => false));
  if (!clicked) throw Object.assign(new Error('点不到「月汇总」tab'), { code: 'TAB_NOT_FOUND' });
  log('已切到「月汇总」');
  await sleep(3000);

  const heads = await readTableHead(session);
  const rows = await readTable(session, { maxRows: 30 });
  if (!rows.length) throw Object.assign(new Error('月汇总表是空的（可能页面改版，或这个账户没有数据）'), { code: 'TABLE_EMPTY' });
  return { heads, rows };
}

/** 推广账户「财务流水 · 月账单」。 */
async function readAdsMonthly(session, { log }) {
  // 财务流水：第二个左侧菜单项（财务管理 / 财务流水 / 资质管理）
  const clickedMenu = await clickTextAny(session, '财务流水', { selector: 'li.anq-menu-item', exact: true, timeoutMs: 8000, what: '「财务流水」菜单' }).catch(() => false);
  if (!clickedMenu) {
    const ok = await session.click(`document.querySelectorAll('li.anq-menu-item')[1]`).catch(() => false);
    if (!ok) throw Object.assign(new Error('点不到「财务流水」菜单'), { code: 'MENU_NOT_FOUND' });
  }
  log('已进「财务流水」');
  await sleep(4000);

  // 日账单 / 月账单
  const clickedTab = await clickTextAny(session, '月账单', { selector: 'div[data-testid^="undefined"], [data-testid="beast-core-tab-itemLabel"]', exact: true, timeoutMs: 8000, what: '「月账单」tab' }).catch(() => false);
  if (!clickedTab) {
    const ok = await session.click(`document.querySelector('div[data-testid="undefined1"]')`).catch(() => false);
    if (!ok) throw Object.assign(new Error('点不到「月账单」tab'), { code: 'TAB_NOT_FOUND' });
  }
  log('已切到「月账单」');
  await sleep(3500);

  const heads = await readTableHead(session);
  const rows = await readTable(session, { maxRows: 30 });
  if (!rows.length) throw Object.assign(new Error('月账单表是空的'), { code: 'TABLE_EMPTY' });
  return { heads, rows };
}

/**
 * @param variant 'guonei' | 'guowai' | 'ads'
 */
export async function runBalanceMonthly(session, { range, log = () => {}, variant = 'guonei' } = {}) {
  const url = variant === 'ads' ? URLS.adsAccount : (variant === 'guowai' ? URLS.mmsFinanceBills : URLS.cashierBills);
  await openPage(session, url, { waitText: 400, timeoutMs: 40000 });
  const landed = await session.url();
  await assertAlive(session, { what: variant === 'ads' ? '推广账户' : '对账中心' });
  log(`已打开：${landed}`);

  const { heads, rows } = variant === 'ads'
    ? await readAdsMonthly(session, { log })
    : await readCashierMonthly(session, { log });

  const metrics = rowsToMetrics(rows, heads);
  const months = [...new Set(metrics.map((m) => m.month))].sort();
  log(`读到 ${rows.length} 行 / ${metrics.length} 个指标（月份：${months.slice(0, 4).join('、')}${months.length > 4 ? '…' : ''}）`);

  // 焦点月份 = 作业声明的区间起点（上月）——台账里每个指标自带月份前缀，range 只标「本次口径」
  return {
    range: { start: range.start, end: range.end, confirmed: true },
    metrics,
    extra: { variant, landed, heads, rowCount: rows.length, months, focusMonth: String(range.start).slice(0, 7) },
  };
}
