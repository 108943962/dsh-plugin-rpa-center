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

window.__fetches = [];
window.fetch = async (url) => {
  const u = String(url);
  window.__fetches.push(u);
  if (u.includes('/rpa/state')) return { ok: true, json: async () => STATE, text: async () => JSON.stringify(STATE) };
  return { ok: true, json: async () => ({ ok: true, runs: [] }), text: async () => '{"ok":true}' };
};

createRoot(document.getElementById('root')).render(React.createElement(Panel));
