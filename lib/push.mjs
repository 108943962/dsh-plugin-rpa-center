/**
 * 结果推送。对应 Automa 里那一串 webhook（/process_pdd_tuiguang_month_alert、
 * /process_day、/process_pdd_tuiguang_7day…）。
 *
 * **按作业分流**：每个 RPA 在下游通常有自己的接口（账单、订单、推广、余额各收各的），
 * 所以配置分两层：
 *   1) `cfg.pushes[jobId]` —— 这条作业自己的接口（填了就用它，优先级最高）
 *   2) `cfg.push`          —— 全局默认（没单独配的作业用它；URL 里可写 `{task}` 占位符）
 * 都没有就跳过。请求体固定成「店铺 + 作业 + 区间 + 指标/文件」，下游按 task 分流即可。
 */
import fs from 'node:fs';

export function buildPayload({ store, task, job, range, metrics, file }) {
  const body = {
    source: 'dsh-pdd-ad-export',
    version: 1,
    // task 就是作业 id（保持老下游兼容）；job 里再带名字，人看得懂
    task,
    job: { id: task, name: String((job && job.name) || task), group: String((job && job.group) || '') },
    store: { id: store.id, name: store.name, storeId: store.storeId || '', platform: store.platform || 'pdd' },
    range: range || null,
    ranAt: new Date().toISOString(),
  };
  if (metrics) body.metrics = metrics;
  if (file) {
    body.file = { name: file.name, size: file.size };
    try {
      body.file.base64 = fs.readFileSync(file.path).toString('base64');
    } catch { /* 读不到就只给元信息 */ }
  }
  return body;
}

/**
 * 决定这次推去哪里。
 * @returns {{entry:object, source:'job'|'global'} | {skip:string} | {error:string}}
 */
export function resolvePush(cfg, task) {
  const id = String(task || '');
  const own = (cfg && cfg.pushes && cfg.pushes[id]) || null;
  if (own && own.url) {
    if (own.enabled === false) return { skip: 'job-push-disabled' };
    return { entry: own, source: 'job' };
  }
  const globalPush = (cfg && cfg.push) || {};
  if (!globalPush.enabled) return { skip: 'push-disabled' };
  if (!globalPush.url) return { error: 'PUSH_NO_URL' };
  return { entry: globalPush, source: 'global' };
}

/** 接口地址里的占位符：{task} → 作业 id（一个模板给多条作业用）。 */
export function fillPushUrl(url, task) {
  return String(url || '').replace(/\{task\}/g, encodeURIComponent(String(task || '')));
}

export async function pushResult(cfg, { store, task, job, range, metrics, file, log = () => {} }) {
  const resolved = resolvePush(cfg, task);
  if (resolved.skip) {
    log(`推送跳过：${resolved.skip === 'job-push-disabled' ? '这条作业的推送被单独关掉了' : '推送没开（只存本地）'}`);
    return { skipped: true, reason: resolved.skip };
  }
  if (resolved.error) return { ok: false, code: resolved.error, error: '推送已开启但没配 URL' };

  const entry = resolved.entry;
  const payload = buildPayload({ store, task, job, range, metrics, file });
  if (file && entry.includeFileBase64 === false && payload.file) delete payload.file.base64;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), entry.timeoutMs || 20000);
  try {
    let url = fillPushUrl(entry.url, task);
    let init;
    if (String(entry.method || 'POST').toUpperCase() === 'GET') {
      // 区间可能为空（比如订单导出，区间由站点决定）——别在这里炸
      const u = new URL(url);
      u.searchParams.set('storeId', store.storeId || store.id);
      u.searchParams.set('task', task);
      if (range && range.start) u.searchParams.set('start', range.start);
      if (range && range.end) u.searchParams.set('end', range.end);
      url = u.toString();
      init = { method: 'GET', signal: controller.signal };
    } else {
      init = { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) };
    }
    log(`推送(${resolved.source === 'job' ? '作业专用' : '默认'}接口) → ${url}`);
    const res = await fetch(url, init);
    const text = await res.text().catch(() => '');
    log(`推送 ${res.status} ${String(text).slice(0, 160)}`);
    return { ok: res.ok, status: res.status, source: resolved.source, url, response: String(text).slice(0, 500) };
  } catch (err) {
    const code = err && err.name === 'AbortError' ? 'PUSH_TIMEOUT' : 'PUSH_FAILED';
    return { ok: false, code, source: resolved.source, error: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
}
