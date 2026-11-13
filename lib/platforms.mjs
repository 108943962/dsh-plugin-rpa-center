/**
 * 平台登记表。RPA 的第一层维度是**平台**（拼多多 / 天猫 / …），第二层才是业务分组（推广 / 财务）。
 *
 * `ready: false` 表示「这个平台的作业还没接入」——界面会把平台列出来但不给假按钮，
 * 而是显示还缺什么。接入新平台时要改三处：
 *   1) 这里加平台；
 *   2) lib/jobs/common.mjs 里补该平台的页面地址与选择器（或新建 common-<platform>.mjs）；
 *   3) 在 lib/jobs/index.mjs 里给这个平台加作业。
 */
export const PLATFORMS = [
  { id: 'pdd', name: '拼多多', ready: true, backend: 'yingxiao.pinduoduo.com', note: '推广报表/推广账户 + 对账中心 + 订单导出' },
  { id: 'tmall', name: '天猫', ready: false, backend: 'myseller.taobao.com', note: '缺：生意参谋/账单页面适配' },
  { id: 'taobao', name: '淘宝', ready: false, backend: 'myseller.taobao.com', note: '缺：生意参谋/账单页面适配' },
  { id: 'jd', name: '京东', ready: false, backend: 'shop.jd.com', note: '缺：京准通/结算页面适配' },
  { id: 'douyin', name: '抖音', ready: false, backend: 'fxg.jinritemai.com', note: '缺：巨量千川/账单页面适配' },
  { id: 'ali1688', name: '1688', ready: false, backend: 'work.1688.com', note: '缺：网销宝/账单页面适配' },
];

export function platformById(id) {
  return PLATFORMS.find((p) => p.id === id) || null;
}

export function platformName(id) {
  const p = platformById(id);
  return p ? p.name : String(id || '');
}

/** 店铺 + 作业 都挂到平台上：给出每个平台的可用性，界面据此渲染 tab。 */
export function platformSummary({ stores = [], jobs = [] } = {}) {
  return PLATFORMS.map((p) => {
    const storeCount = stores.filter((s) => s.platform === p.id).length;
    const jobCount = jobs.filter((j) => j.platform === p.id).length;
    return {
      id: p.id,
      name: p.name,
      ready: Boolean(p.ready),
      backend: p.backend,
      note: p.note,
      storeCount,
      jobCount,
      available: storeCount > 0 && jobCount > 0,
    };
  });
}
