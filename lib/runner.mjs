/**
 * 编排层：作业目录 × 店铺 → 运行 → 记录 → 推送。
 * 和「账号管理」共用店铺与 Chrome 档案（每店一个档案 + 固定调试端口）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { clearAbort, closePage, ensureChrome, isAbortRequested, listPages, newPage, Session } from './engine/cdp.mjs';
import { effectiveStores, files, jobEnabled, loadConfig, recordRun } from './state.mjs';
import { resolveRange } from './range.mjs';
import { pushResult } from './push.mjs';
import { jobById, JOBS, jobsForPlatform, jobMeta, JOB_GROUPS } from './jobs/index.mjs';
import { PLATFORMS, platformSummary } from './platforms.mjs';
import { recordMetrics } from './metrics.mjs';
import { URLS } from './jobs/common.mjs';

export { JOB_GROUPS, JOBS, jobMeta, PLATFORMS, platformSummary };

function logger(collect) {
  return (msg) => {
    collect.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
    try { process.stderr.write(`[rpa-center] ${msg}\n`); } catch { /* ignore */ }
  };
}

/** 打开（必要时拉起）店铺自己的 Chrome，复用一个标签页。 */
export async function openStore(cfg, store, { keep = true, fresh = false } = {}) {
  const chrome = await ensureChrome({
    chromePath: cfg.chromePath,
    profileDir: store.profileDir,
    port: store.port,
    startUrl: URLS.home,
  });
  // 作业跑在**新标签**上：旧标签一旦被弹窗/中断把 Input 通道挂住，
  // 后续 dispatchMouseEvent 会整片超时（踩过），新标签永远是干净的。
  if (fresh) {
    const page = await newPage(store.port, URLS.home);
    return { session: new Session(page.webSocketDebuggerUrl), targetId: page.id, started: chrome.started, page, keep: false };
  }
  const pages = await listPages(store.port).catch(() => []);
  const page = pages.find((p) => /pinduoduo\.com/.test(p.url || '')) || pages[0] || (await newPage(store.port, URLS.home));
  return { session: new Session(page.webSocketDebuggerUrl), targetId: page.id, started: chrome.started, page, keep };
}

/** 跑一个作业（不写历史，供 runStore 复用）。 */
export async function executeJob(cfg, store, jobId, { start, end, log = () => {} } = {}) {
  const job = jobById(jobId);
  if (!job) throw Object.assign(new Error(`没有这个作业：${jobId}`), { code: 'UNKNOWN_JOB' });
  if (job.platform !== store.platform) {
    throw Object.assign(new Error(`作业 ${job.name} 只支持 ${job.platform}，当前店铺是 ${store.platform}`), { code: 'PLATFORM_MISMATCH' });
  }
  const range = resolveRange(job.rangeMode, { start, end });
  runningCount += 1;
  const opened = await openStore(cfg, store, { fresh: true }).catch((err) => { runningCount -= 1; throw err; });
  try {
    const out = await job.run(opened.session, {
      range,
      store,
      log,
      downloadDir: files.raw(store.id, jobId),
    });
    return { job, range: out.range || range, metrics: out.metrics, file: out.file, extra: out.extra, session: opened.session };
  } finally {
    runningCount = Math.max(0, runningCount - 1);
    try { opened.session.close && opened.session.close(); } catch { /* ignore */ }
    if (opened.keep === false) await closePage(store.port, opened.targetId).catch(() => {});
  }
}

/** 跑一家店的一组作业；单条失败只记录，不影响后面的作业。 */
export async function runStore(cfg, store, { jobs, start, end, trigger = 'manual' } = {}) {
  const picked = resolveJobIds(cfg, store, jobs);
  const runs = [];
  for (const jobId of picked) {
    if (isAbortRequested()) { logger([])('已收到停止请求：剩下的作业不再跑'); break; }
    const job = jobById(jobId);
    if (!job) continue;
    const logs = [];
    const log = logger(logs);
    const startedAt = Date.now();
    const entry = {
      ts: new Date().toISOString(),
      storeId: store.id,
      storeName: store.name,
      platform: store.platform,
      jobId,
      jobName: job.name,
      group: job.group,
      output: job.output,
      ok: false,
      ms: 0,
      trigger,
      logs,
    };
    try {
      log(`开始 ${store.name} / ${job.name}`);
      const out = await executeJob(cfg, store, jobId, { start, end, log });
      entry.ok = true;
      entry.ms = Date.now() - startedAt;
      entry.range = out.range;
      if (out.metrics) entry.metrics = out.metrics;
      if (out.file) entry.file = out.file;
      if (out.extra) entry.extra = out.extra;
      log(`完成，用时 ${(out.ms || (Date.now() - startedAt)) / 1000}s`);
      entry.push = await pushResult(cfg, { store, task: jobId, job, range: out.range, metrics: out.metrics, file: out.file, log });
    } catch (err) {
      entry.ok = false;
      entry.ms = Date.now() - startedAt;
      entry.code = (err && err.code) || 'JOB_FAILED';
      entry.error = String((err && err.message) || err);
      entry.cancelled = entry.code === 'CANCELLED';
      log(`${entry.cancelled ? '已停止' : '失败'}[${entry.code}] ${entry.error}`);
    }
    // 指标类作业落台账（快照 JSON + 追加 CSV + 本次运行 CSV），下游/界面都从这里取
    if (entry.ok && entry.metrics && entry.metrics.length) {
      entry.ledger = recordMetrics(entry);
    }
    // 统一产物：不管这条作业是「下载文件」还是「读指标」，运行记录里都要有能点的下载
    entry.artifacts = await buildArtifacts(entry);
    recordRun(entry);
    runs.push(entry);
  }
  return { store: { id: store.id, name: store.name }, runs };
}

/** 跑所有启用店铺 × 各自平台的作业（顺序执行）。 */
export async function runAll({ jobs, only, start, end, trigger = 'manual' } = {}) {
  const cfg = loadConfig();
  const stores = effectiveStores(cfg).filter((s) => s.enabled && (!only || only === s.id || only === s.storeId));
  const out = [];
  for (const store of stores) {
    if (isAbortRequested()) break;
    out.push(await runStore(cfg, store, { jobs, start, end, trigger }));
  }
  return out;
}

/**
 * 这次到底跑哪几条：显式传了 jobs 就只跑这些（本次勾选），
 * 没传就跑「开着的」——批量跑不等于把 13 条全跑一遍。
 */
export function resolveJobIds(cfg, store, jobs) {
  const forPlatform = jobsForPlatform(store.platform);
  if (Array.isArray(jobs) && jobs.length) {
    return forPlatform.filter((j) => jobs.includes(j.id)).map((j) => j.id);
  }
  return forPlatform.filter((j) => jobEnabled(cfg, j.id)).map((j) => j.id);
}

/**
 * 跑完一次运行要落哪些「可下载产物」。
 * 设计原则：**不管什么作业，运行记录里都能点到文件**。
 *   - 业务文件（下载型作业的 zip/xls/csv）→ role=business
 *   - 指标 CSV（一次运行一份，Excel 直接开）→ role=metrics
 *   - 指标快照 JSON → role=snapshot
 *   - 兜底：整条运行记录 run-<ts>.json（含区间/日志/推送结果）→ role=run
 */
async function buildArtifacts(entry) {
  const out = [];
  if (entry.file && entry.file.path) {
    out.push({ role: 'business', kind: 'file', name: entry.file.name, path: entry.file.path, bytes: entry.file.size || 0 });
  }
  const ledger = entry.ledger || {};
  if (ledger.runCsv && ledger.runCsv.path) {
    out.push({ role: 'metrics', kind: 'csv', name: ledger.runCsv.name, path: ledger.runCsv.path, bytes: ledger.runCsv.bytes || 0 });
  }
  if (ledger.snapshot) {
    try {
      const st = fs.statSync(ledger.snapshot);
      out.push({ role: 'snapshot', kind: 'json', name: path.basename(ledger.snapshot), path: ledger.snapshot, bytes: st.size });
    } catch { /* 文件没了就不列 */ }
  }
  // 兜底那一份：哪怕作业既没文件也没指标，也能把这次运行整条下载走
  try {
    const dir = files.raw(entry.storeId, entry.jobId);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = String(entry.ts || new Date().toISOString()).replace(/[:.]/g, '-');
    const runPath = path.join(dir, `run-${stamp}.json`);
    fs.writeFileSync(runPath, JSON.stringify({
      ts: entry.ts, store: { id: entry.storeId, name: entry.storeName }, platform: entry.platform,
      job: { id: entry.jobId, name: entry.jobName }, range: entry.range || null,
      ok: entry.ok, code: entry.code || '', error: entry.error || '',
      file: entry.file || null, extra: entry.extra || null,
      push: entry.push || null, metrics: entry.metrics || null, logs: entry.logs || [],
    }, null, 2) + '\n', 'utf8');
    out.push({ role: 'run', kind: 'json', name: path.basename(runPath), path: runPath, bytes: fs.statSync(runPath).size });
  } catch { /* 写不出来不影响主流程 */ }
  return out;
}

export function isInside(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** 有没有作业正在跑（给界面显示「停止」按钮用）。 */
let runningCount = 0;
export function runningJobs() { return runningCount; }
