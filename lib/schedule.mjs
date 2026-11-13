/**
 * 定时任务：到点自动把作业跑一遍。支持**多条规则**（不同时间跑不同作业）。
 *
 * 设计取舍：
 *   - 定时判断在**宿主进程**里做（每 30 秒 tick 一次），不依赖外部 cron；
 *     DSH 没开着就不会跑，所以每条规则都有「补跑」（catchUp）：启动后如果发现当天还没跑过，就补一次。
 *   - 一条规则 = 名称 + 时间(HH:mm) + 星期 + 作业清单(空 = 跟「批量」开关) + 补跑开关。
 *   - 状态按规则分开存 `schedule-state.json`（{ rules: { id: {lastRunDate,lastRunAt,lastResult} } }），
 *     不往 config.json 里写运行痕迹。
 *   - 同一时刻到点的多条规则**顺序执行**，不会并发开一堆浏览器。
 */
import fs from 'node:fs';
import { files, loadConfig } from './state.mjs';

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const TIME_RE = /^\d{1,2}:\d{1,2}$/;

/** 统一收口一条规则。 */
export function normalizeRule(raw, index = 0) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const time = TIME_RE.test(String(r.time || '')) ? String(r.time) : '08:30';
  const [hh, mm] = time.split(':').map(Number);
  const days = Array.isArray(r.days) && r.days.length
    ? [...new Set(r.days.map(Number).filter((d) => d >= 0 && d <= 6 && Number.isInteger(d)))].sort()
    : [0, 1, 2, 3, 4, 5, 6];
  return {
    id: String(r.id || `rule-${index + 1}`).trim() || `rule-${index + 1}`,
    name: String(r.name || `任务 ${index + 1}`).trim().slice(0, 24) || `任务 ${index + 1}`,
    enabled: Boolean(r.enabled),
    time: `${pad(Math.min(23, Math.max(0, hh)))}:${pad(Math.min(59, Math.max(0, mm)))}`,
    days,
    jobs: Array.isArray(r.jobs) ? [...new Set(r.jobs.map((x) => String(x || '').trim()).filter(Boolean))] : [],
    catchUp: r.catchUp === undefined ? true : Boolean(r.catchUp),
  };
}

/** 兼容老配置：单条 {enabled,time,days,jobs,catchUp} → rules[0]。 */
export function normalizeRules(schedule) {
  const s = (schedule && typeof schedule === 'object') ? schedule : {};
  const list = Array.isArray(s.rules) ? s.rules : (TIME_RE.test(String(s.time || '')) ? [s] : []);
  const rules = list.map((r, i) => normalizeRule(r, i));
  // id 去重
  const seen = new Set();
  return rules.map((r) => {
    let id = r.id;
    let n = 2;
    while (seen.has(id)) id = `${r.id}-${n++}`;
    seen.add(id);
    return { ...r, id };
  });
}

/** 这条规则今天该跑吗？ */
export function shouldRun(rule, lastRunDate, now = new Date()) {
  if (!rule.enabled) return { run: false, reason: 'disabled' };
  if (!rule.days.includes(now.getDay())) return { run: false, reason: 'not-a-scheduled-day' };
  const [hh, mm] = rule.time.split(':').map(Number);
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (now < due) return { run: false, reason: 'before-time' };
  if (lastRunDate === dayKey(now)) return { run: false, reason: 'already-ran-today' };
  const late = now.getTime() - due.getTime();
  const windowMs = rule.catchUp ? DAY_MS : 60 * 60 * 1000;
  if (late > windowMs) return { run: false, reason: 'missed-window', lateMinutes: Math.round(late / 60000) };
  return { run: true, reason: 'due', dueAt: due.toISOString(), lateMinutes: Math.round(late / 60000) };
}

/** 所有已启用规则里，下一次会跑的时间（给界面用）。 */
export function nextRunAt(schedule, now = new Date()) {
  const rules = normalizeRules(schedule).filter((r) => r.enabled);
  if (!rules.length) return null;
  let best = null;
  for (const rule of rules) {
    for (let i = 0; i < 8; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (!rule.days.includes(d.getDay())) continue;
      const [hh, mm] = rule.time.split(':').map(Number);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      if (at.getTime() > now.getTime() && (!best || at < best)) best = at;
      break;
    }
  }
  return best ? best.toISOString() : null;
}

// ── 状态文件 ────────────────────────────────────────────────────────────────
export function readScheduleState() {
  try {
    const raw = JSON.parse(fs.readFileSync(files.scheduleState(), 'utf8'));
    return { rules: (raw && raw.rules) || {} };
  } catch {
    return { rules: {} };
  }
}

export function writeScheduleState(state) {
  try {
    fs.mkdirSync(files.data(), { recursive: true });
    fs.writeFileSync(files.scheduleState(), JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch { /* 写不进去不影响运行 */ }
}

/** 跑一条规则（tick 与「立即执行」共用）。 */
export async function runRule(rule, runJobs, { now = new Date(), trigger = 'schedule' } = {}) {
  const startedAt = new Date().toISOString();
  const results = await runJobs(rule);
  const runs = results.flatMap((b) => (b && b.runs) || []);
  const ok = runs.filter((r) => r.ok).length;
  const state = readScheduleState();
  state.rules[rule.id] = {
    lastRunDate: dayKey(now),
    lastRunAt: startedAt,
    lastResult: {
      trigger,
      rule: { id: rule.id, name: rule.name, time: rule.time },
      runs: runs.length,
      ok,
      failed: runs.length - ok,
      failedJobs: runs.filter((r) => !r.ok).map((r) => `${r.storeName}/${r.jobId}:${r.code || ''}`).slice(0, 10),
    },
  };
  writeScheduleState(state);
  return { rule: { id: rule.id, name: rule.name }, runs, ok, failed: runs.length - ok };
}

// ── 定时器 ──────────────────────────────────────────────────────────────────
let timer = null;

export function startScheduler({ runJobs, log = () => {}, intervalMs = 30000 } = {}) {
  if (timer) { clearInterval(timer); timer = null; }
  let running = false;
  const tick = async () => {
    if (running) return;
    const cfg = loadConfig();
    const rules = normalizeRules(cfg.schedule);
    const state = readScheduleState();
    const due = rules.filter((r) => shouldRun(r, (state.rules[r.id] || {}).lastRunDate).run);
    if (!due.length) return;
    running = true;
    try {
      for (const rule of due) {
        log(`定时任务「${rule.name}」触发（${rule.time}）：${rule.jobs.length ? rule.jobs.join(',') : '按批量开关'}`);
        try {
          const out = await runRule(rule, runJobs, { trigger: 'schedule' });
          log(`定时任务「${rule.name}」完成：${out.ok} 成功 / ${out.failed} 失败`);
        } catch (err) {
          log(`定时任务「${rule.name}」出错：${String((err && err.message) || err)}`);
          const st = readScheduleState();
          st.rules[rule.id] = { lastRunDate: dayKey(new Date()), lastRunAt: new Date().toISOString(), lastResult: { trigger: 'schedule', error: String((err && err.message) || err) } };
          writeScheduleState(st);
        }
      }
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, Math.max(5000, Number(intervalMs) || 30000));
  timer.unref?.();
  return () => stopScheduler();
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
