/**
 * 插件状态：配置 + 运行记录。都落在 <DSH_HOME>/pdd-ad-export/ 下，不动别的插件的数据。
 * 配置里**不存账号密码**：每个店铺用独立的 Chrome 档案，登录一次长期复用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

export function pluginDir() {
  return path.join(dshHome(), 'rpa-center');
}

export const files = {
  config: () => path.join(pluginDir(), 'config.json'),
  runs: () => path.join(pluginDir(), 'runs.json'),
  scheduleState: () => path.join(pluginDir(), 'schedule-state.json'),
  exports: () => path.join(pluginDir(), 'exports'),
  profiles: () => path.join(pluginDir(), 'profiles'),
  raw: (storeId, task) => path.join(pluginDir(), 'raw', storeId, task),
  data: () => path.join(pluginDir(), 'data'),
};

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function defaultConfig() {
  return {
    version: 1,
    // 店铺从哪来：'shop-accounts' = 复用「账号管理」那个插件的店铺/档案/端口（推荐）
    //              'local'        = 只用自己的 stores 列表
    source: 'shop-accounts',
    platforms: ['pdd'],
    chromePath: DEFAULT_CHROME,
    // 全局默认推送（兜底）：作业自己没配接口时才用它。URL 里可以写 {task} 占位符。
    push: { enabled: false, url: '', method: 'POST', timeoutMs: 20000, includeFileBase64: true },
    // 每个作业自己的推送接口：{ [jobId]: {enabled,url,method,timeoutMs,includeFileBase64} }
    // 不配（或 url 为空）就走上面的全局默认 —— 原来「所有作业共用一个接口」就是这里缺了维度。
    pushes: {},
    // 作业开关：{ [jobId]: {enabled:false} }。没出现的默认开启。
    // 「全部店铺跑一遍 / 跑全部作业」只跑开着的这些 —— 批量跑不等于把 13 条全跑一遍。
    jobs: {},
    // 定时任务：可以有多条规则，各自时间/星期/作业清单（jobs 空 = 按上面的「批量」开关）
    schedule: { rules: [] },
    // 外部登录门槛（可选）：enabled 时才读 statusFile，由部署方写入
    // { enforced, loggedIn, user, reason, title, message }；不认识的登录系统一律不掺和
    gate: { enabled: false, statusFile: '' },
    concurrency: 1,
    stores: [],
  };
}

/** 推送接口的 URL 只允许 http(s)：配置是给人填的，别变成任意协议的手脚。 */
function safePushUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  try {
    const u = new URL(url.replace(/\{task\}/g, 'x'));
    return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '';
  } catch {
    return '';
  }
}

/** 一条推送配置（全局默认 / 某个作业的）统一收口。 */
function sanitizePushEntry(raw, base) {
  const p = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    enabled: p.enabled === undefined ? base.enabled !== false : Boolean(p.enabled),
    url: safePushUrl(p.url),
    method: String(p.method || base.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
    timeoutMs: Math.min(120000, Math.max(1000, Number(p.timeoutMs) || base.timeoutMs || 20000)),
    includeFileBase64: p.includeFileBase64 === undefined ? Boolean(base.includeFileBase64) : Boolean(p.includeFileBase64),
  };
}

/** 「账号管理」插件的店铺表（它的档案/登录态都在里面，直接复用，别再让用户配一遍）。 */
export function shopAccountsFile() {
  return path.join(dshHome(), 'shop-accounts', 'accounts.json');
}

export function readShopAccounts() {
  const raw = readJson(shopAccountsFile(), null);
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : (raw.accounts || raw.items || []);
  return Array.isArray(list) ? list : [];
}

/**
 * 实际生效的店铺：source=shop-accounts 时以对方店铺表为准（同 id 可被本地 stores 覆盖，
 * 用来临时改端口/停用），只保留配置里列出的平台。
 */
export function effectiveStores(cfg) {
  const local = new Map((cfg.stores || []).map((s) => [s.id, s]));
  if (cfg.source !== 'shop-accounts') return cfg.stores || [];
  const platforms = Array.isArray(cfg.platforms) && cfg.platforms.length ? cfg.platforms : ['pdd'];
  const out = [];
  for (const a of readShopAccounts()) {
    const platform = String(a && a.platform || '');
    if (!platforms.includes(platform)) continue;
    const id = String(a.id || '');
    if (!id) continue;
    const mapped = {
      id,
      name: String(a.name || a.loginName || id),
      storeId: String(a.storeId || a.loginName || a.id || ''),
      platform,
      profileDir: String(a.profileDir || ''),
      port: Number(a.port) || 0,
      enabled: a.pendingLogin === true ? true : true,
    };
    out.push({ ...mapped, ...(local.get(id) || {}), id, platform });
  }
  // 本地额外加的（不在账号管理里的）也保留
  for (const [id, s] of local) {
    if (!out.some((x) => x.id === id)) out.push(s);
  }
  return out;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** 收口所有可写字段，避免把任意字符串灌进配置。 */
export function sanitizeConfig(raw) {
  const base = defaultConfig();
  const out = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  out.source = String(out.source || base.source) === 'local' ? 'local' : 'shop-accounts';
  out.platforms = (Array.isArray(out.platforms) && out.platforms.length ? out.platforms : base.platforms)
    .map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8);
  out.chromePath = String(out.chromePath || base.chromePath);
  out.concurrency = Math.min(4, Math.max(1, Number(out.concurrency) || 1));
  out.push = sanitizePushEntry(raw && raw.push, base.push);
  out.push.enabled = Boolean(out.push.enabled);
  // 每个作业的接口：只留「确实填了地址」的；没填 = 跟着全局默认走，不占配置
  out.gate = (() => {
    const rawGate = (raw && raw.gate && typeof raw.gate === 'object') ? raw.gate : {};
    return {
      enabled: rawGate.enabled === true,
      statusFile: String(rawGate.statusFile || '').trim(),
    };
  })();

  // 定时任务（多条规则；老配置里的单条 {time,days,jobs} 自动升级成 rules[0]）
  out.schedule = (() => {
    const rawSched = (raw && raw.schedule && typeof raw.schedule === 'object') ? raw.schedule : {};
    const list = Array.isArray(rawSched.rules)
      ? rawSched.rules
      : (/^\d{1,2}:\d{1,2}$/.test(String(rawSched.time || '')) ? [rawSched] : []);
    const pad2 = (n) => String(n).padStart(2, '0');
    const seen = new Set();
    const rules = list.slice(0, 12).map((r0, i) => {
      const r = (r0 && typeof r0 === 'object') ? r0 : {};
      const time = /^\d{1,2}:\d{1,2}$/.test(String(r.time || '')) ? String(r.time) : '08:30';
      const [hh, mm] = time.split(':').map(Number);
      const days = Array.isArray(r.days) && r.days.length
        ? [...new Set(r.days.map(Number).filter((d) => d >= 0 && d <= 6 && Number.isInteger(d)))].sort()
        : [0, 1, 2, 3, 4, 5, 6];
      let id = String(r.id || `rule-${i + 1}`).trim() || `rule-${i + 1}`;
      let n = 2;
      while (seen.has(id)) id = `${id}-${n++}`;
      seen.add(id);
      return {
        id,
        name: String(r.name || `任务 ${i + 1}`).trim().slice(0, 24) || `任务 ${i + 1}`,
        enabled: Boolean(r.enabled),
        time: `${pad2(Math.min(23, Math.max(0, hh)))}:${pad2(Math.min(59, Math.max(0, mm)))}`,
        days,
        jobs: Array.isArray(r.jobs) ? [...new Set(r.jobs.map((x) => String(x || '').trim()).filter(Boolean))] : [],
        catchUp: r.catchUp === undefined ? true : Boolean(r.catchUp),
      };
    });
    return { rules };
  })();

  out.jobs = {};
  const rawJobs = (raw && raw.jobs && typeof raw.jobs === 'object') ? raw.jobs : {};
  for (const [key, value] of Object.entries(rawJobs)) {
    const id = String(key || '').trim();
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(id)) continue;
    out.jobs[id] = { enabled: !(value && value.enabled === false) };
  }
  out.pushes = {};
  const rawPushes = (raw && raw.pushes && typeof raw.pushes === 'object') ? raw.pushes : {};
  for (const [key, value] of Object.entries(rawPushes)) {
    const id = String(key || '').trim();
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(id)) continue;
    // 作业自己的条目默认是「开」的：填了地址就是要推，别被全局那个开关带偏
    const entry = sanitizePushEntry(value, { ...out.push, enabled: true });
    if (entry.url) out.pushes[id] = entry;
  }
  const seen = new Set();
  out.stores = (Array.isArray(out.stores) ? out.stores : [])
    .map((s, i) => {
      const id = String((s && s.id) || '').trim() || `store-${i + 1}`;
      // platform 必须留着：作业是按平台挂的，本地店铺丢了 platform 就一条作业都匹配不上
      // （界面上看起来像「这个功能没实现」）。
      const platform = String((s && s.platform) || '').trim() || (out.platforms[0] || 'pdd');
      return {
        id,
        name: String((s && s.name) || id).trim(),
        storeId: String((s && s.storeId) || id).trim(),
        platform,
        note: String((s && s.note) || '').trim(),
        profileDir: String((s && s.profileDir) || '').trim() || path.join(files.profiles(), id),
        // 端口：没填/填错就给一个不冲突的默认值（以前 Math.max(1024, 0) 会把它变成 1024，
        // 多店铺时全挤到 1024 这条端口上）
        port: (() => {
          const p = Number(s && s.port);
          return Number.isFinite(p) && p >= 1024 && p <= 65535 ? p : 9200 + i;
        })(),
        enabled: s && s.enabled === false ? false : true,
      };
    })
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  return out;
}

export function loadConfig() {
  return sanitizeConfig(readJson(files.config(), {}));
}

export function saveConfig(raw) {
  const cfg = sanitizeConfig(raw);
  writeJson(files.config(), cfg);
  return cfg;
}

export function loadRuns() {
  const r = readJson(files.runs(), { runs: [] });
  return Array.isArray(r && r.runs) ? r.runs : [];
}

export function recordRun(entry) {
  const runs = loadRuns();
  runs.unshift(entry);
  writeJson(files.runs(), { runs: runs.slice(0, 300) });
  return entry;
}

/** 清空运行记录（界面「最近运行」那一份）。返回清掉了多少条。 */
export function clearRuns() {
  const count = loadRuns().length;
  writeJson(files.runs(), { runs: [] });
  return count;
}

export function storeById(cfg, id) {
  return (cfg.stores || []).find((s) => s.id === id || s.storeId === id) || null;
}

export function ensureDirs() {
  for (const d of [pluginDir(), files.exports(), files.profiles(), files.data()]) fs.mkdirSync(d, { recursive: true });
}

/** 作业是否参与批量运行（没配过 = 参与）。 */
export function jobEnabled(cfg, jobId) {
  const entry = (cfg && cfg.jobs && cfg.jobs[String(jobId || '')]) || null;
  return !(entry && entry.enabled === false);
}

/** 某平台当前启用中的作业 id 清单（界面「本次运行」的默认勾选）。 */
export function enabledJobIds(cfg, platform, allJobs) {
  return (allJobs || []).filter((j) => j.platform === platform && jobEnabled(cfg, j.id)).map((j) => j.id);
}
