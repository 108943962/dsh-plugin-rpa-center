/**
 * 作业目录：这个插件里所有 RPA 作业都在这里登记。
 *
 * 加一个新 RPA（财务账单、结算单、发票、商品报表…）只需要：
 *   1) 在 jobs/ 下写一个 run 函数：({ session, range, store, log, downloadDir }) => { range, metrics? , file? }
 *   2) 在这里加一行元数据（分组、平台、区间口径、输出类型）
 * 界面会自动出现这条作业、店铺对应的按钮、以及运行历史——不用改 UI。
 *
 * 现在的 13 条作业里，10 条是从原来每天手动跑的 Automa 流程搬过来的（见每条 desc）。
 */
import { runPromotionMonth } from './promotion.mjs';
import { runFinanceStatement } from './finance.mjs';
import { runBillStatement } from './bill.mjs';
import { runOrderExport } from './orders.mjs';
import { runAdsReport } from './ads.mjs';
import { runBalanceMonthly } from './balance.mjs';

export const JOB_GROUPS = [
  { id: 'promotion', name: '推广', hint: '广告投放数据与报表' },
  { id: 'orders', name: '订单', hint: '订单对账报表' },
  { id: 'finance', name: '财务', hint: '账户资金与账单' },
  { id: 'balance', name: '账户余额', hint: '月汇总 / 月账单' },
];

export const JOBS = [
  // ── 推广 ────────────────────────────────────────────────────────────────────
  {
    id: 'promotion_month',
    group: 'promotion',
    name: '月推广指标',
    platform: 'pdd',
    rangeMode: 'last_month_to_today',
    rangeLabel: '上月 1 号 → 今天',
    output: 'metrics',
    desc: '推广概况：总花费/交易额/投产比/成交笔数/今日花费…',
    timeoutMs: 60000,
    async run(session, opts) {
      const out = await runPromotionMonth(session, opts);
      return { range: out.range, metrics: out.metrics, extra: { missingLabels: out.missingLabels, url: out.url } };
    },
  },
  {
    id: 'ads_goods_month',
    group: 'promotion',
    name: '商品推广报表（本月）',
    platform: 'pdd',
    rangeMode: 'this_month_to_today',
    rangeLabel: '本月 1 号 → 今天',
    output: 'file',
    desc: '原 Automa「5.商品推广月」：推广报表 → 本月区间 → 下载',
    timeoutMs: 180000,
    run: (session, opts) => runAdsReport(session, opts),
  },
  {
    id: 'ads_month_export',
    group: 'promotion',
    name: '推广报表（上月 1 号→今天）',
    platform: 'pdd',
    rangeMode: 'last_month_to_today',
    rangeLabel: '上月 1 号 → 今天',
    output: 'file',
    desc: '原 Automa「6.月推广数据」：推广报表 → 跨月区间 → 下载',
    timeoutMs: 180000,
    run: (session, opts) => runAdsReport(session, opts),
  },

  // ── 订单 ────────────────────────────────────────────────────────────────────
  {
    id: 'order_guonei',
    group: 'orders',
    name: '订单对账报表（国内）',
    platform: 'pdd',
    rangeMode: 'none',
    rangeLabel: '全部订单（近 3 个月，平台上限）',
    output: 'file',
    desc: '原 Automa「4.国内订单-月」：订单查询 → 批量导出 → 对账报表 → 下载',
    timeoutMs: 240000,
    run: (session, opts) => runOrderExport(session, opts),
  },
  {
    id: 'order_guowai',
    group: 'orders',
    name: '订单对账报表（海外）',
    platform: 'pdd',
    rangeMode: 'none',
    rangeLabel: '全部订单（近 3 个月，平台上限）',
    output: 'file',
    desc: '原 Automa「3.海外订单-月」：同一套订单导出流程，跨境店铺用',
    timeoutMs: 240000,
    run: (session, opts) => runOrderExport(session, opts),
  },

  // ── 财务 ────────────────────────────────────────────────────────────────────
  {
    id: 'finance_month',
    group: 'finance',
    name: '财务流水（上月）',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月整月',
    output: 'file',
    desc: '财务流水明细 xls：时间/资金类型/交易金额/余额/摘要',
    timeoutMs: 90000,
    run: runFinanceStatement,
  },
  {
    id: 'finance_30d',
    group: 'finance',
    name: '财务流水（近 30 天）',
    platform: 'pdd',
    rangeMode: 'trailing_30d',
    rangeLabel: '昨天往前 30 天',
    output: 'file',
    desc: '同上，滚动 30 天，适合每天对账',
    timeoutMs: 90000,
    run: runFinanceStatement,
  },
  {
    id: 'bill_guonei',
    group: 'finance',
    name: '货款对账单（上月）',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月整月',
    output: 'file',
    desc: '原 Automa「1.国内下载对账单」：对账中心·货款账户 → 导出 → 下载',
    timeoutMs: 240000,
    run: (session, opts) => runBillStatement(session, { ...opts, variant: 'goods' }),
  },
  {
    id: 'bill_guowai',
    group: 'finance',
    name: '海外对账单（上月）',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月整月',
    output: 'file',
    desc: '原 Automa「2.海外对账单」：跨境财务流水页；国内店铺会落到同一个对账中心',
    timeoutMs: 240000,
    run: (session, opts) => runBillStatement(session, { ...opts, variant: 'overseas' }),
  },
  {
    id: 'bill_deposit',
    group: 'finance',
    name: '保证金账单（上月）',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月整月',
    output: 'file',
    desc: '原 Automa「9.国内保证金」：对账中心·保证金账户 → 导出 → 下载（zip）',
    timeoutMs: 240000,
    run: (session, opts) => runBillStatement(session, { ...opts, variant: 'deposit' }),
  },

  // ── 账户余额（读表 → 指标台账）──────────────────────────────────────────────
  {
    id: 'balance_guonei',
    group: 'balance',
    name: '账单余额（国内·月汇总）',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月（表格含全年各月）',
    output: 'metrics',
    desc: '原 Automa「8.国内账单余额」：对账中心·月汇总 → 收入/支出/期初/期末',
    timeoutMs: 120000,
    run: (session, opts) => runBalanceMonthly(session, { ...opts, variant: 'guonei' }),
  },
  {
    id: 'balance_guowai',
    group: 'balance',
    name: '账单余额（海外·月汇总）',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月（表格含全年各月）',
    output: 'metrics',
    desc: '原 Automa「7.国外账单余额」：跨境账单页的月汇总',
    timeoutMs: 120000,
    run: (session, opts) => runBalanceMonthly(session, { ...opts, variant: 'guowai' }),
  },
  {
    id: 'ads_balance',
    group: 'balance',
    name: '推广账户月账单',
    platform: 'pdd',
    rangeMode: 'last_month',
    rangeLabel: '上月（表格含各月）',
    output: 'metrics',
    desc: '原 Automa「10.推广月余额」：财务流水·月账单 → 余额/收入/支出',
    timeoutMs: 120000,
    run: (session, opts) => runBalanceMonthly(session, { ...opts, variant: 'ads' }),
  },
];

export function jobById(id) {
  return JOBS.find((j) => j.id === id) || null;
}

export function jobsForPlatform(platform) {
  return JOBS.filter((j) => j.platform === platform);
}

/** 给界面用的元数据（不含 run 函数，别把函数塞进 JSON）。 */
export function jobMeta() {
  return JOBS.map((j) => ({
    id: j.id,
    group: j.group,
    name: j.name,
    platform: j.platform,
    rangeMode: j.rangeMode,
    rangeLabel: j.rangeLabel,
    output: j.output,
    desc: j.desc,
  }));
}
