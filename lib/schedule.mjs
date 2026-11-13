/**
 * 定时任务：到点自动把作业跑一遍。
 *
 * 设计取舍：
 *   - 定时判断在**宿主进程**里做（每 30 秒 tick 一次），不依赖外部 cron；
 *     DSH 没开着就不会跑，所以有「补跑」（catchUp）：启动后如果发现今天还没跑过，就补一次。
 *   - 只用一条规则：每天 HH:mm，选星期几，跑哪些作业（空 = 跟着每条作业的「批量」开关）。
 *     多条规则反而容易互相踩（同一份导出 5 分钟内跑两次会被站点拒绝），先不做。
 *   - 状态单独存 `schedule-state.json`（lastRunDate / lastRunAt / lastResult），
 *     不往 config.json 里写运行痕迹，避免每次跑完都改配置。
 */
import fs from 'node:fs';
import { files, loadConfig } from './state.mjs';

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

/** 统一收口一条定时规则（config.schedule）。 */
export function normalizeSchedule(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  const time = /^\d{1,2}:\d{1,2}$/.test(String(s.time || '')) ? String(s.time) : '08:30';
  const [hh, mm] = time.split(':').map(Number);
  const days = Array.isArray(s.days) && s.days.length
    ? [...new Set(s.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : [0, 1, 2, 3, 4, 5, 6];
  const jobs = Array.isArray(s.jobs) ? [...new Set(s.jobs.map((x) => String(x || '')).filter(Boolean))] : [];
  return {
    enabled: Boolean(s.enabled),
    time: `${pad(Math.min(23, Math.max(0, hh)))}:${pad(Math.min(59, Math.max(0, mm)))}`,
    days,
    jobs,
    catchUp: s.catchUp === undefined ? true : Boolean(s.catchUp),
  };
}

const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 今天这条规则的执行时刻（本地时区）。 */
export function todayRunAt(sched, now = new Date()) {
  const [hh, mm] = sched.time.split(':').map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
}

/**
 * 现在该不该跑？
 * @returns {{run:boolean, reason:string, dueAt?:string, windowMs?:number}}
 */
export function shouldRun(sched, lastRunDate, now = new Date()) {
  if (!sched.enabled) return { run: false, reason: 'disabled' };
  if (!sched.days.includes(now.getDay())) return { run: false, reason: 'not-a-scheduled-day' };
  const due = todayRunAt(sched, now);
  if (now < due) return { run: false, reason: 'before-time' };
  if (lastRunDate === dayKey(now)) return { run: false, reason: 'already-ran-today' };
  // 补跑窗口：catchUp 开着就允许当天任意时刻补；关掉只认「到点后 60 分钟内」
  const late = now.getTime() - due.getTime();
  const windowMs = sched.catchUp ? DAY_MS : 60 * 60 * 1000;
  if (late > windowMs) return { run: false, reason: 'missed-window', lateMinutes: Math.round(late / 60000) };
  return { run: true, reason: 'due', dueAt: due.toISOString(), lateMinutes: Math.round(late / 60000) };
}

/** 下一次会跑的时间（只用于界面展示）。 */
export function nextRunAt(sched, now = new Date()) {
  if (!sched.enabled || !sched.days.length) return null;
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!sched.days.includes(d.getDay())) continue;
    const at = todayRunAt(sched, d);
    if (at.getTime() > now.getTime()) return at.toISOString();
  }
  return null;
}

// ── 状态文件 ────────────────────────────────────────────────────────────────
export function readScheduleState() {
  try {
    return JSON.parse(fs.readFileSync(files.scheduleState(), 'utf8'));
  } catch {
    return { lastRunDate: '', lastRunAt: '', lastResult: null };
  }
}

export function writeScheduleState(state) {
  try {
    fs.mkdirSync(files.data(), { recursive: true });
    fs.writeFileSync(files.scheduleState(), JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch { /* 写不进去不影响运行 */ }
}

/**
 * 跑一次（给 tick 与「立即执行」共用）。
 * @param runJobs () => Promise<results>
 */
export async function runScheduled(runJobs, { now = new Date(), trigger = 'schedule' } = {}) {
  const state = readScheduleState();
  const startedAt = new Date().toISOString();
  const results = await runJobs();
  const runs = results.flatMap((b) => (b && b.runs) || []);
  const ok = runs.filter((r) => r.ok).length;
  writeScheduleState({
    lastRunDate: dayKey(now),
    lastRunAt: startedAt,
    lastResult: {
      trigger,
      runs: runs.length,
      ok,
      failed: runs.length - ok,
      failedJobs: runs.filter((r) => !r.ok).map((r) => `${r.storeName}/${r.jobId}:${r.code || ''}`).slice(0, 10),
    },
  });
  return { runs, ok, failed: runs.length - ok };
}

/**
 * 启动定时器：每 30 秒看一眼有没有到点。
 * 注意：宿主热重载会再次 apply，这里用模块级变量保证只有一个计时器。
 */
let timer = null;
export function startScheduler({ runJobs, log = () => {}, intervalMs = 30000 } = {}) {
  if (timer) { clearInterval(timer); timer = null; }
  let running = false;
  const tick = async () => {
    if (running) return;
    const cfg = loadConfig();
    const sched = normalizeSchedule(cfg.schedule);
    const verdict = shouldRun(sched, readScheduleState().lastRunDate);
    if (!verdict.run) return;
    running = true;
    try {
      log(`定时任务触发（${sched.time}，迟 ${verdict.lateMinutes || 0} 分钟）：${sched.jobs.length ? sched.jobs.join(',') : '按批量开关'}`);
      const out = await runScheduled(runJobs, { trigger: 'schedule' });
      log(`定时任务完成：${out.ok} 成功 / ${out.failed} 失败`);
    } catch (err) {
      log(`定时任务出错：${String((err && err.message) || err)}`);
      writeScheduleState({ ...readScheduleState(), lastRunDate: dayKey(new Date()), lastRunAt: new Date().toISOString(), lastResult: { trigger: 'schedule', error: String((err && err.message) || err) } });
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, Math.max(5000, Number(intervalMs) || 30000));
  timer.unref?.();   // 不要因为这个计时器让进程退不出去
  return () => { if (timer) { clearInterval(timer); timer = null; } };
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
