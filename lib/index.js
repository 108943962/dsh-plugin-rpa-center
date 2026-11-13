/**
 * dsh-plugin-rpa-center —— 宿主半身。
 *
 * 一个「RPA 中心」：作业目录（推广/财务/…）× 店铺 = 可执行任务；
 * 结果、日志、产物都落盘，界面在左侧栏那个入口里。
 */
import fs from 'node:fs';
import path from 'node:path';
import { clearRuns, effectiveStores, ensureDirs, files, jobEnabled, loadConfig, loadRuns, pluginDir, saveConfig } from './state.mjs';
import { isInside, openStore, runAll, runStore, runningJobs, JOB_GROUPS, jobMeta, platformSummary } from './runner.mjs';
import { clearMetrics, metricsCsvPath, readMetrics } from './metrics.mjs';
import { clearAbort, requestAbort } from './engine/cdp.mjs';
import { nextRunAt, normalizeRules, readScheduleState, runRule, shouldRun, startScheduler, stopScheduler } from './schedule.mjs';

export const name = 'dsh-plugin-rpa-center';
export const inject = ['webServer'];

const HEADER = 'x-dsh-rpa-center';
const BASE = '/rpa';

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('请求体过大'), { code: 'BODY_TOO_LARGE' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch { reject(Object.assign(new Error('请求体不是 JSON'), { code: 'BAD_JSON' })); }
    });
    req.on('error', reject);
  });
}

function findStore(cfg, id) {
  return effectiveStores(cfg).find((s) => s.id === id || s.storeId === id) || null;
}

export function apply(ctx) {
  ensureDirs();

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const sub = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) || '/' : url.pathname;
    const method = String(req.method || 'GET').toUpperCase();

    // 同源判定：插件界面里的普通 <a> 点击带不上自定义头（浏览器不允许），
    // 所以下载这条单独放开「同源 + GET」，并且只允许读插件目录内的文件。
    const sameOrigin = (() => {
      const ref = req.headers.referer || req.headers.origin || '';
      if (!ref) return false;
      try { return new URL(ref).host === req.headers.host; } catch { return false; }
    })();
    const headerOk = req.headers[HEADER] === '1';
    const isDownload = method === 'GET' && sub === '/file' && sameOrigin;
    if (!headerOk && !isDownload) {
      return sendJson(res, 403, { ok: false, error: '缺少 x-dsh-rpa-center 请求头：只允许本插件界面调用' });
    }
    if (method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
      return sendJson(res, 415, { ok: false, error: 'Content-Type 必须是 application/json' });
    }

    try {
      if (method === 'GET' && sub === '/state') {
        const cfg = loadConfig();
        const stores = effectiveStores(cfg);
        return sendJson(res, 200, {
          ok: true,
          source: cfg.source,
          // config.stores 给「本地店铺」的原始列表（设置页要原样存回）；
          // 合并后的实际店铺在顶层 stores 里，别用合并结果覆盖用户配置
          config: { ...cfg },
          stores,
          // 每条作业带 enabled：批量运行只跑开着的（界面上的「批量」勾选框就是它）
          jobs: jobMeta().map((j) => ({ ...j, enabled: jobEnabled(cfg, j.id) })),
          groups: JOB_GROUPS,
          // 第一层维度：平台（拼多多/天猫/…）—— 带该平台下的店铺数、作业数、是否已接入
          platforms: platformSummary({ stores, jobs: jobMeta().map((j) => ({ ...j, enabled: jobEnabled(cfg, j.id) })) }),
          runs: loadRuns().slice(0, 40),
          running: runningJobs() > 0,
          // 定时任务：多条规则 + 每条的上次结果 / 全局下次
          schedule: (() => {
            const rules = normalizeRules(cfg.schedule);
            const st = readScheduleState();
            return {
              rules: rules.map((r) => ({ ...r, state: st.rules[r.id] || null, due: shouldRun(r, (st.rules[r.id] || {}).lastRunDate) })),
              nextRunAt: nextRunAt(cfg.schedule),
            };
          })(),
          dirs: { plugin: pluginDir(), exports: files.exports(), profiles: files.profiles(), data: files.data() },
          metricsCsv: metricsCsvPath(),
          now: new Date().toISOString(),
        });
      }

      if (method === 'POST' && sub === '/config') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { ok: true, config: saveConfig(body) });
      }

      if (method === 'POST' && sub === '/run') {
        const body = await readJsonBody(req);
        const cfg = loadConfig();
        const store = findStore(cfg, String(body.storeId || ''));
        if (!store) return sendJson(res, 404, { ok: false, error: `没有这个店铺：${String(body.storeId || '')}` });
        clearAbort();
        const out = await runStore(cfg, store, { jobs: body.jobs, start: body.start, end: body.end });
        return sendJson(res, 200, { ok: true, runs: out.runs });
      }

      if (method === 'POST' && sub === '/run-all') {
        const body = await readJsonBody(req);
        clearAbort();
        const out = await runAll({ jobs: body.jobs, only: body.storeId, start: body.start, end: body.end });
        return sendJson(res, 200, { ok: true, batches: out });
      }

      // 停止：置一个全局标记，正在跑的作业会在下一次等待时退出
      if (method === 'POST' && sub === '/stop') {
        requestAbort();
        return sendJson(res, 200, { ok: true, running: runningJobs() });
      }

      // 立刻跑一次定时规则（不给 ruleId 就跑第一条）；界面上的「立即执行」用它
      if (method === 'POST' && sub === '/schedule-run') {
        const body = await readJsonBody(req);
        const cfgNow = loadConfig();
        const rules = normalizeRules(cfgNow.schedule);
        if (!rules.length) return sendJson(res, 400, { ok: false, error: '还没有定时任务，先添加一条' });
        const rule = body && body.ruleId ? rules.find((r) => r.id === String(body.ruleId)) : rules[0];
        if (!rule) return sendJson(res, 404, { ok: false, error: `没有这条定时任务：${body.ruleId}` });
        clearAbort();
        const out = await runRule(rule, (r) => runAll({ jobs: r.jobs.length ? r.jobs : undefined, trigger: 'schedule' }), { trigger: 'schedule-manual' });
        return sendJson(res, 200, { ok: true, ...out });
      }

      // 检测 Chrome 路径是否可用（设置页那个「检测」用）
      if (method === 'POST' && sub === '/check') {
        const body = await readJsonBody(req);
        const target = String(body.chromePath || loadConfig().chromePath || '');
        const exists = Boolean(target) && fs.existsSync(target);
        return sendJson(res, 200, { ok: true, chromePath: target, exists });
      }

      if (method === 'POST' && sub === '/open') {
        const body = await readJsonBody(req);
        const cfg = loadConfig();
        const store = findStore(cfg, String(body.storeId || ''));
        if (!store) return sendJson(res, 404, { ok: false, error: '没有这个店铺' });
        const opened = await openStore(cfg, store, { keep: true });
        return sendJson(res, 200, { ok: true, started: opened.started, port: store.port, url: opened.page?.url || '' });
      }

      // 清除日志：默认只清「最近运行」记录；withMetrics=true 时连指标台账 CSV 一起清
      if (method === 'POST' && sub === '/clear-runs') {
        const body = await readJsonBody(req);
        const removed = clearRuns();
        const metricsCleared = body.withMetrics === true ? clearMetrics() : false;
        return sendJson(res, 200, { ok: true, removed, metricsCleared });
      }

      // 指标台账查询：给下游/BI 取最近指标（长表）
      if (method === 'GET' && sub === '/metrics') {
        const storeId = url.searchParams.get('storeId') || '';
        const jobId = url.searchParams.get('jobId') || '';
        const limit = Number(url.searchParams.get('limit')) || 200;
        return sendJson(res, 200, Object.assign({ ok: true }, readMetrics({ storeId, jobId, limit })));
      }

      if (method === 'GET' && sub === '/file') {
        const target = String(url.searchParams.get('path') || '');
        if (!target || !isInside(pluginDir(), target)) return sendJson(res, 403, { ok: false, error: '只允许读取插件目录下的文件' });
        if (!fs.existsSync(target)) return sendJson(res, 404, { ok: false, error: '文件不存在' });
        const stat = fs.statSync(target);
        res.writeHead(200, {
          'content-type': /\.csv$/i.test(target) ? 'text/csv; charset=utf-8' : 'application/octet-stream',
          'content-length': stat.size,
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`,
          'cache-control': 'no-store',
        });
        return fs.createReadStream(target).pipe(res);
      }

      return sendJson(res, 404, { ok: false, error: `未知接口：${method} ${sub}` });
    } catch (err) {
      return sendJson(res, 400, { ok: false, code: err.code || 'BAD_REQUEST', error: String((err && err.message) || err) });
    }
  };

  // 定时任务：每 30 秒看一眼到点没（热重载会重复 apply，startScheduler 内部保证只有一个计时器）
  try {
    startScheduler({
      runJobs: (rule) => runAll({ jobs: rule.jobs.length ? rule.jobs : undefined, trigger: 'schedule' }),
      log: (msg) => { try { ctx.logger?.info?.(`[rpa-center] ${msg}`); } catch { /* ignore */ } },
    });
  } catch { /* 定时器起不来不影响手动运行 */ }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: BASE, handler });
  try { ctx.logger?.info?.(`[rpa-center] 已挂载 ${BASE}`); } catch { /* ignore */ }
  return () => {
    try { stopScheduler(); } catch { /* ignore */ }
    try { dispose(); } catch { /* ignore */ }
  };
}
