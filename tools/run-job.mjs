/**
 * 开发者用：不经过界面，直接对某个店铺跑一条作业（跑的是插件同一份代码）。
 *
 *   node tools/run-job.mjs <店铺名或id> <作业id> [--start 2026-10-01 --end 2026-10-31]
 *   node tools/run-job.mjs 购喜旺财务专用 bill_guonei
 *   node tools/run-job.mjs 购喜旺财务专用 balance_guonei
 *
 * 会真的操作浏览器（新建标签、关标签、可能点导出）；跑完打印区间/指标/文件。
 */
import { executeJob } from '../lib/runner.mjs';
import { effectiveStores, loadConfig } from '../lib/state.mjs';
import { jobById, JOBS } from '../lib/jobs/index.mjs';

const argv = process.argv.slice(2);
const opt = {};
const rest = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--start') opt.start = argv[++i];
  else if (argv[i] === '--end') opt.end = argv[++i];
  else if (argv[i] === '--list') opt.list = true;
  else rest.push(argv[i]);
}

const cfg = loadConfig();
const stores = effectiveStores(cfg);

if (opt.list || rest.length < 2) {
  console.log('店铺：\n' + stores.map((s) => `  - ${s.name} (${s.id}) port=${s.port}`).join('\n'));
  console.log('\n作业：\n' + JOBS.map((j) => `  - ${j.id.padEnd(20)} ${j.group.padEnd(10)} ${j.name}`).join('\n'));
  process.exit(opt.list ? 0 : 2);
}

const [who, jobId] = rest;
const store = stores.find((s) => s.id === who || s.storeId === who || s.name === who || s.name.includes(who));
if (!store) {
  console.error(`没有这个店铺：${who}；可选：${stores.map((s) => s.name).join('、')}`);
  process.exit(2);
}
const job = jobById(jobId);
if (!job) {
  console.error(`没有这个作业：${jobId}；可选：${JOBS.map((j) => j.id).join('、')}`);
  process.exit(2);
}

const log = (msg) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const started = Date.now();
try {
  const out = await executeJob(cfg, store, jobId, { start: opt.start, end: opt.end, log });
  const ms = Date.now() - started;
  console.log(JSON.stringify({
    ok: true,
    store: store.name,
    job: job.name,
    ms,
    range: out.range || null,
    metrics: out.metrics ? { count: out.metrics.length, sample: out.metrics.slice(0, 8) } : null,
    file: out.file || null,
    extra: out.extra || null,
  }, null, 2));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ ok: false, store: store.name, job: jobId, ms: Date.now() - started, code: err.code || 'JOB_FAILED', error: String((err && err.message) || err) }, null, 2));
  process.exit(1);
}
