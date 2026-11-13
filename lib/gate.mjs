/**
 * 外部登录门槛（可选，插件本身不认识任何具体登录系统）。
 *
 * 契约：部署方（比如「途阳jiajia」的 ptc-suite）写一个状态文件，
 *       RPA 中心只读它，决定「作业面板显示不显示 / 能不能跑」。
 *
 *   <DSH_HOME>/rpa-center/gate.json     （或 config.gate.statusFile / RPA_GATE_STATUS_FILE）
 *   {
 *     "enforced": true,                 // 这个部署是否要求登录
 *     "loggedIn": false,                // 当前是否已登录
 *     "user": { "name": "张三" },        // 可选，登录后在面板副标题显示
 *     "reason": "no-token",             // 可选，排障用
 *     "title": "需要先登录途阳",          // 可选，提示卡标题
 *     "message": "点右上角「登录途阳」…",  // 可选，提示卡正文
 *     "updatedAt": "2026-11-13T08:00:00Z"
 *   }
 *
 * 只有当 config.gate.enabled = true 时才会读这个文件；文件不存在 / 读不出来按
 * 「不拦」处理（fail-open：门槛是体验约束，不该把用户锁在门外）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function dshHome(env = process.env) {
  if (env.DSH_HOME) return env.DSH_HOME;
  return path.join(env.USERPROFILE || env.HOME || os.homedir(), '.dsh');
}

export function gateStatusFile(cfg, env = process.env) {
  const raw = (cfg && cfg.gate) || {};
  return String(raw.statusFile || env.RPA_GATE_STATUS_FILE || path.join(dshHome(env), 'rpa-center', 'gate.json'));
}

/**
 * @returns {{enabled:boolean, enforced:boolean, loggedIn:boolean, user:object|null, reason:string,
 *            title:string, message:string, statusFile:string, updatedAt:string}}
 */
export function resolveGate(cfg, env = process.env) {
  const raw = (cfg && cfg.gate && typeof cfg.gate === 'object') ? cfg.gate : {};
  const statusFile = gateStatusFile(cfg, env);
  const base = {
    enabled: raw.enabled === true,
    enforced: false,
    loggedIn: true,
    user: null,
    reason: 'disabled',
    title: '',
    message: '',
    statusFile,
    updatedAt: '',
  };
  if (!base.enabled) return base;

  let status = null;
  try { status = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch { status = null; }
  if (!status || typeof status !== 'object') {
    return { ...base, reason: 'status-missing' };
  }
  const enforced = status.enforced === true;
  const loggedIn = status.loggedIn === true;
  return {
    ...base,
    enforced,
    loggedIn: enforced ? loggedIn : true,
    user: (status.user && typeof status.user === 'object') ? { name: String(status.user.name || ''), id: String(status.user.id || '') } : null,
    reason: String(status.reason || (loggedIn ? 'ok' : 'not-logged-in')),
    title: String(status.title || ''),
    message: String(status.message || ''),
    updatedAt: String(status.updatedAt || ''),
  };
}

/** 接口用：被门槛拦住时抛 401。 */
export function assertGate(cfg, env = process.env) {
  const gate = resolveGate(cfg, env);
  if (gate.enforced && !gate.loggedIn) {
    throw Object.assign(new Error(gate.title || '需要先登录后再使用 RPA 中心'), {
      code: 'LOGIN_REQUIRED', status: 401, gateReason: gate.reason,
    });
  }
  return gate;
}
