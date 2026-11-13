/**
 * 登录门槛：只有「途阳」登录之后才允许看作业、跑作业。
 *
 * 登录态来自 ptc-suite（@tuyang/ptc-suite）写在本机的 token 文件：
 *   <DSH_HOME>/tuyang-mcp-token.json   （可用 PTC_MCP_TOKEN_FILE / config.auth.tokenFile 覆盖）
 * 结构：{ version, activeUserId, accounts: { <id>: { accessToken, name, expiresAt, ... } } }
 * 我们只读、不写、不碰 token 内容（只判断有没有、有没有过期）。
 *
 * 三档：
 *   auth.required = false → 不启用登录门槛（插件本身保持通用）
 *   auth.required = auto   → 只有本机确实部署了 ptc-suite（token 文件或 tuyang-mcp.json 存在）才启用
 *   auth.required = true   → 一律要求登录（tuyang-jiajia 这种产品部署用这个）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function dshHome(env = process.env) {
  if (env.DSH_HOME) return env.DSH_HOME;
  return path.join(env.USERPROFILE || env.HOME || os.homedir(), '.dsh');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** 从 token 文件里挑出当前登录账号；没有/过期都算未登录。 */
export function readTuyangLogin(tokenFile, now = Date.now()) {
  const raw = readJson(tokenFile);
  if (!raw || typeof raw !== 'object') return { loggedIn: false, reason: 'no-token-file' };
  const accounts = (raw.accounts && typeof raw.accounts === 'object') ? raw.accounts : (raw.accessToken ? { legacy: raw } : {});
  const usable = Object.values(accounts).filter((a) => a && typeof a.accessToken === 'string' && a.accessToken);
  if (!usable.length) return { loggedIn: false, reason: 'no-account' };
  const pick = (raw.activeUserId && usable.find((a) => String(a.id || '') === String(raw.activeUserId))) || usable[0];
  const expiresAt = Number(pick.expiresAt) || 0;
  if (expiresAt && expiresAt < now) return { loggedIn: false, reason: 'token-expired', user: { id: String(pick.id || ''), name: String(pick.name || pick.id || '') } };
  return {
    loggedIn: true,
    reason: 'ok',
    user: {
      id: String(pick.id || ''),
      name: String(pick.name || (pick.identity && pick.identity.nickname) || pick.id || ''),
      accountCount: usable.length,
    },
  };
}

/**
 * 解析当前的门槛状态。
 * @returns {{mode:'off'|'auto'|'required', enforced:boolean, loggedIn:boolean, user:object|null, reason:string, tokenFile:string}}
 */
export function resolveAuth(cfg, env = process.env, now = Date.now()) {
  const raw = (cfg && cfg.auth && typeof cfg.auth === 'object') ? cfg.auth : {};
  const mode = raw.required === true ? 'required' : (raw.required === false ? 'off' : 'auto');
  const tokenFile = String(raw.tokenFile || env.PTC_MCP_TOKEN_FILE || path.join(dshHome(env), 'tuyang-mcp-token.json'));
  const deploymentFile = String(env.PTC_MCP_CONFIG || path.join(dshHome(env), 'tuyang-mcp.json'));
  const deployed = fs.existsSync(tokenFile) || fs.existsSync(deploymentFile);
  const enforced = mode === 'required' || (mode === 'auto' && deployed);
  if (!enforced) return { mode, enforced: false, loggedIn: true, user: null, reason: 'not-enforced', tokenFile };
  const login = readTuyangLogin(tokenFile, now);
  return { mode, enforced: true, loggedIn: login.loggedIn, user: login.user || null, reason: login.reason, tokenFile };
}

/** 给接口用：未登录时抛 401。 */
export function assertLoggedIn(cfg, env = process.env) {
  const auth = resolveAuth(cfg, env);
  if (auth.enforced && !auth.loggedIn) {
    throw Object.assign(new Error(`需要先登录途阳（${auth.reason === 'token-expired' ? '登录已过期' : '当前未登录'}）`), {
      code: 'LOGIN_REQUIRED', status: 401, authReason: auth.reason,
    });
  }
  return auth;
}
