/** 生成 /rpa/state 的真实返回（临时 DSH_HOME，不碰 ~/.dsh） */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rpa-ui-home-'));
process.env.DSH_HOME = home;
const { apply } = await import('../../lib/index.js');

let handler = null;
apply({ webServer: { register: (d) => { handler = d.handler; return () => {}; } }, logger: { info: () => {} } });

function call(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = {
      method, url,
      headers: { 'x-dsh-rpa-center': '1', 'content-type': 'application/json' },
      on(ev, cb) { if (ev === 'data' && body) cb(Buffer.from(JSON.stringify(body))); if (ev === 'end') cb(); },
      destroy() {},
    };
    const res = { writeHead() {}, end(b) { resolve(JSON.parse(String(b))); } };
    handler(req, res).catch(reject);
  });
}

await call('POST', '/rpa/config', {
  source: 'local',
  chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  stores: [{ name: '测试店铺', port: 9222 }],
  push: { enabled: false, url: '' },
});
const state = await call('GET', '/rpa/state');
fs.writeFileSync(new URL('./state.json', import.meta.url), JSON.stringify(state));
fs.rmSync(home, { recursive: true, force: true });
console.log(`state.json: ${state.jobs.length} 条作业 / ${state.stores.length} 家店 / ${state.groups.length} 个分组`);
