/**
 * 区间口径。Automa 里那几个 JS 片段其实就是这两件事，只是散落到每份流程里：
 *   - 上月 1 号 → 今天（月推广，滚动看当月）
 *   - 上月 1 号 → 上月最后一天（月报/财务流水，整月对账）
 * 统一在这里算，DSL/任务只拿现成的 YYYY-MM-DD。
 */

const pad = (n) => String(n).padStart(2, '0');

export function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function lastMonth(now = new Date()) {
  const firstOfThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(firstOfThis.getTime() - 86400000);
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start: fmt(start), end: fmt(end) };
}

export function lastMonthToToday(now = new Date()) {
  const { start } = lastMonth(now);
  return { start, end: fmt(now) };
}

export function thisMonthToToday(now = new Date()) {
  return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) };
}

export function trailingDays(now = new Date(), days = 30) {
  const n = Number(days) > 0 ? Number(days) : 30;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  return { start: fmt(start), end: fmt(end) };
}

/** 任务声明的区间 → 具体日期；也接受调用方显式传 start/end。 */
export function resolveRange(mode, { start, end, now = new Date(), days } = {}) {
  if (start && end) return { start: String(start), end: String(end) };
  switch (String(mode || '')) {
    case 'last_month': return lastMonth(now);
    case 'last_month_to_today': return lastMonthToToday(now);
    case 'this_month_to_today': return thisMonthToToday(now);
    case 'trailing_30d': return trailingDays(now, days || 30);
    // 区间由站点自己决定（比如订单批量导出固定「近 3 个月」）：不编造区间
    case 'none': return null;
    default: return lastMonth(now);
  }
}

/** 页面日期面板认 YYYY/MM/DD。 */
export function rangeSlash(range) {
  return { start: String(range.start).replace(/-/g, '/'), end: String(range.end).replace(/-/g, '/') };
}
