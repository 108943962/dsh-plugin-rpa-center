/**
 * 最小可用的 CDP 工具层（只做这个插件需要的事）：
 *   - 确保店铺自己的 Chrome 起来了（独立 --user-data-dir + 调试端口）
 *   - 发一条 CDP 命令 / 求值一个表达式
 *   - 「真实鼠标点击」（很多站点只认可信事件）
 *   - 把下载拦到指定目录（页面级 + 浏览器级 + 兜底盯 ~/Downloads）
 *
 * 不做的事：不 inject fetch/XHR 钩子、不读 cookie、不碰 localStorage。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));

/** 只允许连本机回环端口，避免配置里塞进别人的调试端口。 */
export function assertLoopback(url) {
  const u = new URL(url);
  const h = u.hostname;
  const ok = h === '127.0.0.1' || h === 'localhost' || h === '::1';
  if (!ok) throw Object.assign(new Error(`只允许连本机调试端口，收到 ${h}`), { code: 'NON_LOCAL_CDP' });
  return url;
}

export async function httpJson(port, p, init) {
  const res = await fetch(assertLoopback(`http://127.0.0.1:${port}${p}`), { cache: 'no-store', ...init });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error(`调试端口返回不是 JSON：${text.slice(0, 120)}`), { code: 'BAD_CDP_RESPONSE' });
  }
}

export async function listPages(port, timeoutMs = 2000) {
  const out = [];
  const all = await Promise.race([
    httpJson(port, '/json'),
    sleep(timeoutMs).then(() => { throw Object.assign(new Error('调试端口无响应'), { code: 'CDP_TIMEOUT' }); }),
  ]);
  for (const t of Array.isArray(all) ? all : []) {
    if (t && t.type === 'page' && t.webSocketDebuggerUrl) out.push(t);
  }
  return out;
}

export async function isChromeUp(port) {
  try {
    const v = await httpJson(port, '/json/version');
    return Boolean(v && v['Browser']);
  } catch {
    return false;
  }
}

/** 起一个属于这个店铺的 Chrome（独立档案 + 调试端口）。已经在跑就直接复用。 */
export async function ensureChrome({ chromePath, profileDir, port, startUrl = 'about:blank', waitMs = 25000 }) {
  if (await isChromeUp(port)) return { started: false, port };
  const exe = String(chromePath || '').trim();
  if (!exe || !fs.existsSync(exe)) {
    throw Object.assign(new Error(`找不到 Chrome 可执行文件：${chromePath || '(空)'}`), { code: 'CHROME_NOT_FOUND' });
  }
  fs.mkdirSync(profileDir, { recursive: true });
  const child = spawn(exe, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    startUrl,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await isChromeUp(port)) return { started: true, port, pid: child.pid };
    await sleep(400);
  }
  throw Object.assign(new Error(`Chrome 起来了但调试端口 ${port} 没响应（可能被别的进程占用）`), { code: 'CDP_TIMEOUT' });
}

export async function newPage(port, url) {
  const p = await httpJson(port, `/json/new?${encodeURIComponent(url)}`, { method: 'PUT', cache: 'no-store' });
  if (!p || !p.webSocketDebuggerUrl) throw Object.assign(new Error('新建标签页失败'), { code: 'CDP_NO_TARGET' });
  return p;
}

export async function closePage(port, targetId) {
  try { await fetch(assertLoopback(`http://127.0.0.1:${port}/json/close/${targetId}`), { cache: 'no-store' }); } catch { /* ignore */ }
}

/**
 * 等一个新标签出现（站点自己开的那种，比如「批量导出」点完会开导出记录页）。
 * exclude 传进来之前的 target id 集合，避免认成旧标签。
 */
export async function waitForTab(port, match, { timeoutMs = 25000, exclude = [], pollMs = 600 } = {}) {
  const re = match instanceof RegExp ? match : new RegExp(String(match));
  const skip = new Set(exclude);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pages = await listPages(port).catch(() => []);
    const hit = pages.find((p) => !skip.has(p.id) && re.test(p.url || ''));
    if (hit) return hit;
    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`等不到新标签（${re}）`), {
        code: 'TAB_TIMEOUT',
        tabs: pages.map((p) => p.url).slice(0, 8),
      });
    }
    await sleep(pollMs);
  }
}

/**
 * 一条 CDP 会话：**复用一条 WebSocket**。
 * 之前每条命令新建连接，连续点击（清弹层 / 选日期）会把调试连接打满，
 * 表现就是随机的 `Input.dispatchMouseEvent 超时`。
 */
export class Session {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.seq = 0;
    this.pending = new Map();
    this.ws = null;
    this.opening = null;
  }

  ensure() {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve(this.ws);
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(assertLoopback(this.wsUrl)); } catch (err) { this.opening = null; reject(err); return; }
      const timer = setTimeout(() => {
        this.opening = null;
        try { ws.close(); } catch { /* ignore */ }
        reject(Object.assign(new Error('调试连接超时'), { code: 'CDP_TIMEOUT' }));
      }, 10000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        this.ws = ws;
        this.opening = null;
        resolve(ws);
      });
      ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
        const task = this.pending.get(msg.id);
        if (!task) return;
        this.pending.delete(msg.id);
        clearTimeout(task.timer);
        if (msg.error) task.reject(Object.assign(new Error(msg.error.message || 'CDP_ERROR'), { code: 'CDP_ERROR' }));
        else task.resolve(msg.result);
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        this.opening = null;
        reject(Object.assign(new Error('调试连接失败'), { code: 'CDP_REFUSED' }));
      });
      ws.addEventListener('close', () => {
        this.ws = null;
        for (const [, task] of this.pending) {
          clearTimeout(task.timer);
          task.reject(Object.assign(new Error('调试连接已断开'), { code: 'CDP_CLOSED' }));
        }
        this.pending.clear();
      });
    });
    return this.opening;
  }

  send(method, params = {}, timeoutMs = 15000) {
    return this.ensure().then((ws) => new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`CDP 超时：${method}`), { code: 'CDP_TIMEOUT' }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { ws.send(JSON.stringify({ id, method, params })); } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    }));
  }

  close() {
    try { this.ws && this.ws.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  async evaluate(expression, timeoutMs = 20000) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false }, timeoutMs);
    if (r && r.exceptionDetails) {
      throw Object.assign(new Error(`页面里执行出错：${r.exceptionDetails.text || '异常'}`), { code: 'PAGE_ERROR' });
    }
    return r && r.result ? r.result.value : undefined;
  }

  async navigate(url, waitMs = 1200) {
    await this.send('Page.navigate', { url }, 20000);
    await sleep(waitMs);
  }

  /** 用真实鼠标事件点元素（表达式返回元素）。返回 false 表示找不到/不可见。 */
  async click(expr) {
    const box = await this.evaluate(`(() => {
      const el = ${expr};
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) return null;
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    })()`);
    if (!box) return false;
    const { x, y } = JSON.parse(box);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, 5000);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, 5000);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, 5000);
    return true;
  }

  /** 等某个条件成立（表达式返回真值）。 */
  async waitFor(expression, { timeoutMs = 10000, pollMs = 300, what = '条件' } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const v = await this.evaluate(expression).catch(() => null);
      if (v) return true;
      if (Date.now() >= deadline) {
        throw Object.assign(new Error(`等不到${what}（${timeoutMs}ms）`), { code: 'WAIT_TIMEOUT' });
      }
      await sleep(pollMs);
    }
  }

  async pageText() {
    return String((await this.evaluate('document.body ? document.body.innerText : ""')) || '');
  }

  async url() {
    return String((await this.evaluate('location.href')) || '');
  }

  async setDownloadDir(dir) {
    let ok = false;
    let lastErr = null;
    try {
      await this.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }, 5000);
      ok = true;
    } catch (err) { lastErr = err; }
    try {
      const ver = await httpJson(new URL(this.wsUrl.replace(/^ws:/, 'http:')).port, '/json/version');
      const browserWs = ver && ver.webSocketDebuggerUrl;
      if (browserWs) {
        const b = new Session(browserWs);
        await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: false }, 5000);
        ok = true;
      }
    } catch (err) { lastErr = lastErr || err; }
    if (!ok) throw Object.assign(new Error(`浏览器不接受下载目录：${lastErr && lastErr.message}`), { code: 'DOWNLOAD_DIR_REFUSED' });
  }
}

/** 下载目录候选：我们自己的目录 + 系统「下载」（站点可能绕过 CDP 设置）。 */
export function downloadWatchDirs(ownDir) {
  const home = os.homedir();
  const extra = [path.join(home, 'Downloads'), path.join(home, '下载')].filter((d) => {
    try { return fs.statSync(d).isDirectory(); } catch { return false; }
  });
  return [ownDir, ...extra];
}

export function listFiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (/\.(crdownload|tmp|part)$/i.test(name)) continue;
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && st.size > 0) out.push({ name, path: p, size: st.size, mtimeMs: st.mtimeMs });
    } catch { /* ignore */ }
  }
  return out;
}

/**
 * 点下载后等文件落盘：同时盯自己的目录和系统「下载」目录，只认本次运行新出现的文件。
 * 命中后把文件**移进**自己的目录（跨盘 rename 失败则复制），返回稳定路径。
 */
/**
 * 点下载**之前**先拍一张目录快照。
 * 为什么：文件可能在 200ms 内就落盘，如果等点击完再扫目录，它会进「已存在」集合被忽略
 * —— 表现就是「点了下载但永远等不到文件」（踩过）。
 */
export function snapshotDownloads(ownDir) {
  const dirs = downloadWatchDirs(ownDir);
  return new Set(dirs.flatMap((d) => listFiles(d).map((f) => f.path)));
}

/**
 * 文件是否已经写完：大小连续 stableMs 不变（zip/xls 会边下边写，抓到一半会得到坏文件）。
 */
async function waitFileStable(filePath, { stableMs = 900, timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let sameSince = Date.now();
  for (;;) {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch { return 0; }
    if (size !== last) { last = size; sameSince = Date.now(); }
    else if (Date.now() - sameSince >= stableMs) return size;
    if (Date.now() >= deadline) return last;
    await sleep(250);
  }
}

export async function captureDownload(session, ownDir, { timeoutMs = 60000, since = Date.now(), pollMs = 500, baseline = null } = {}) {
  fs.mkdirSync(ownDir, { recursive: true });
  const dirs = downloadWatchDirs(ownDir);
  const seen = baseline || new Set(dirs.flatMap((d) => listFiles(d).map((f) => f.path)));
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = dirs
      .flatMap((d) => listFiles(d))
      .filter((f) => !seen.has(f.path) && f.mtimeMs >= since - 2000);
    if (fresh.length) {
      const primary = fresh[0];
      let saved = primary.path;
      if (path.dirname(primary.path) !== ownDir) {
        const target = path.join(ownDir, primary.name);
        try { fs.renameSync(primary.path, target); } catch { try { fs.copyFileSync(primary.path, target); } catch { /* keep original */ } }
        if (fs.existsSync(target)) saved = target;
      }
      const size = await waitFileStable(saved);
      return { path: saved, name: path.basename(saved), size: size || (fs.existsSync(saved) ? fs.statSync(saved).size : primary.size), extra: fresh.slice(1) };
    }
    if (Date.now() >= deadline) {
      throw Object.assign(new Error(`等不到下载文件（${timeoutMs}ms）：站点可能改了下载入口，或下载被浏览器拦截`), { code: 'DOWNLOAD_TIMEOUT' });
    }
    await sleep(pollMs);
  }
}

export { sleep };
