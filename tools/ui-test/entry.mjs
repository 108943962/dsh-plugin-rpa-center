/** 用真 React 渲染 lib/client.js 的面板（fetch 用 state.json 顶替） */
import React from 'react';
import { createRoot } from 'react-dom/client';
import STATE from './state.json';
import '../../lib/client.js';

const mod = window.__CLIENT__.factory((name) => (name === 'react' ? React : undefined));
let Panel = null;
mod.apply({
  get: () => null,
  effect: () => {},
  slots: {
    inject: (name, cb) => cb(),
    register: (spec, Comp) => { if (spec && spec.name === 'main') Panel = Comp; },
  },
});

// 加 ?gate=1 时模拟「未登录途阳」，用来测登录门槛
const STATE_VIEW = new URLSearchParams(location.search).has('gate')
  ? { ...STATE, auth: { mode: 'required', enforced: true, loggedIn: false, reason: 'no-token-file', user: null } }
  : STATE;

window.__fetches = [];
window.fetch = async (url) => {
  const u = String(url);
  window.__fetches.push(u);
  if (u.includes('/rpa/state')) return { ok: true, json: async () => STATE_VIEW, text: async () => JSON.stringify(STATE_VIEW) };
  return { ok: true, json: async () => ({ ok: true, runs: [] }), text: async () => '{"ok":true}' };
};

createRoot(document.getElementById('root')).render(React.createElement(Panel));
