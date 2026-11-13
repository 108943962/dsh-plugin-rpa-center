/**
 * 任务：月推广数据（推广概况 → 上月 1 号 ~ 今天）
 * 等价于 Automa 里「推广概况 → 开日期面板 → 点上月1号/今天 → 查询」那一段，
 * 但选择器按语义找、失败有明确错误码。
 */
import { sleep } from '../engine/cdp.mjs';
import { parseMetrics } from '../parse.mjs';
import { clickByText, dismissOverlays, openPage, pickRange, URLS } from './common.mjs';

/** 推广概况页的指标标签（页面上就是这么写的，改版时只需要动这张表）。 */
export const PROMOTION_METRICS = [
  { key: 'balance', label: '总余额 (元)', kind: 'money' },
  { key: 'today_cost', label: '今日花费 (元)', kind: 'money' },
  { key: 'total_cost', label: '总花费(元)', kind: 'money' },
  { key: 'deal_cost', label: '成交花费(元)', kind: 'money' },
  { key: 'gmv', label: '交易额(元)', kind: 'money' },
  { key: 'net_gmv', label: '净交易额(元)', kind: 'money' },
  { key: 'roi', label: '实际投产比', kind: 'ratio' },
  { key: 'net_roi', label: '净实际投产比', kind: 'ratio' },
  { key: 'net_orders', label: '净成交笔数', kind: 'count' },
  { key: 'cost_per_order', label: '每笔净成交花费(元)', kind: 'money' },
  { key: 'net_gmv_ratio', label: '净交易额占比', kind: 'percent' },
  { key: 'net_orders_ratio', label: '净成交笔数占比', kind: 'percent' },
  { key: 'promoting', label: '推广中', kind: 'count' },
  { key: 'low_balance', label: '余额不足', kind: 'count' },
  { key: 'daily_limit', label: '到达日限额', kind: 'count' },
  { key: 'paused', label: '手动暂停', kind: 'count' },
  { key: 'rejected', label: '审核驳回', kind: 'count' },
];

export async function runPromotionMonth(session, { range, log = () => {} } = {}) {
  const meta = await openPage(session, URLS.promotion, { waitText: 700, timeoutMs: 30000 });
  log('推广概况已打开');

  const picked = await pickRange(session, {
    start: range.start,
    end: range.end,
    opener: `document.querySelector('div.anq-picker')`,
    log,
  });
  log(`日期区间 ${picked.start} ~ ${picked.end}（页面回显：${picked.inputs.join(' | ')}）`);

  // 推广概况选完区间会自动刷新；给一点时间，再确认花费区块出现
  await sleep(2500);
  try {
    await session.waitFor(`(document.body.innerText || '').includes('总花费')`, { timeoutMs: 8000, what: '推广数据区块' });
  } catch {
    log('提示：没看到「总花费」区块，可能页面结构变了，继续按已知标签解析');
  }

  const text = await session.pageText();
  const { values, missing } = parseMetrics(text, PROMOTION_METRICS);
  const metrics = Object.entries(values).map(([label, value]) => ({
    key: (PROMOTION_METRICS.find((m) => m.label === label) || {}).key || label,
    label,
    value,
  }));
  return {
    url: meta.url,
    range: { start: picked.start, end: picked.end, confirmed: picked.confirmed },
    metrics,
    missingLabels: missing,
    textLength: text.length,
  };
}
