/**
 * 提交前自检：不启动 DSH、不碰真实配置，直接把宿主的 apply() 挂到一个假 webServer 上，
 * 打一遍 /rpa/state 和 /rpa/config，确认「面板一打开就会调到的路径」没有 undefined。
 *
 *   node tools/smoke.mjs
 *
 * 为什么要有它：面板报错是「读取失败：xxx is not defined」这种，只有真打一次才会暴露；
 * 这个脚本用临时 DSH_HOME，不会动 ~/.dsh 里的任何数据。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rpa-smoke-'));
process.env.DSH_HOME = tmpHome;

const { apply } = await import('../lib/index.js');

let handler = null;
apply({
  webServer: { register: (def) => { handler = def.handler; return () => {}; } },
  logger: { info: () => {} },
});
if (!handler) {
  console.error('✗ apply() 没有注册路由');
  process.exit(1);
}

function call(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { 'x-dsh-rpa-center': '1', 'content-type': 'application/json', host: '127.0.0.1' },
      on(ev, cb) {
        if (ev === 'data' && body !== undefined) cb(Buffer.from(JSON.stringify(body)));
        if (ev === 'end') cb();
      },
      destroy() {},
    };
    const res = { writeHead() {}, end(b) { try { resolve(JSON.parse(String(b))); } catch (err) { reject(err); } } };
    handler(req, res).catch(reject);
  });
}

let bad = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) bad += 1;
};

try {
  const s1 = await call('GET', '/rpa/state');
  check('GET /rpa/state 返回 ok', s1.ok === true, s1.error || '');
  check('作业数 > 0', Array.isArray(s1.jobs) && s1.jobs.length > 0, `jobs=${s1.jobs && s1.jobs.length}`);
  check('每条作业都带 enabled', (s1.jobs || []).every((j) => typeof j.enabled === 'boolean'));
  check('分组非空', Array.isArray(s1.groups) && s1.groups.length > 0);
  check('平台摘要非空', Array.isArray(s1.platforms) && s1.platforms.length > 0);
  check('config 里有 jobs/pushes', s1.config && typeof s1.config.jobs === 'object' && typeof s1.config.pushes === 'object');

  const target = s1.jobs[0].id;
  const saved = await call('POST', '/rpa/config', {
    source: s1.source,
    chromePath: s1.config.chromePath,
    push: s1.config.push,
    pushes: {},
    jobs: { [target]: { enabled: false } },
  });
  check('POST /rpa/config 保存成功', saved.ok === true, saved.error || '');
  check('开关写回配置', saved.config && saved.config.jobs && saved.config.jobs[target] && saved.config.jobs[target].enabled === false);

  const s2 = await call('GET', '/rpa/state');
  check('重新读 /state 开关仍然生效', s2.jobs.find((j) => j.id === target).enabled === false);

  const run = await call('POST', '/rpa/run', { storeId: 'no-such-store', jobs: [target] });
  check('POST /rpa/run 未知店铺给出明确错误', run.ok === false && /没有这个店铺/.test(run.error || ''), run.error || '');

  // 本地店铺模式（设置里「只用本插件自己的店铺」）
  const local = await call('POST', '/rpa/config', {
    source: 'local',
    platforms: ['pdd'],
    stores: [{ name: '本地测试店', port: 9411 }],
    push: { enabled: false, url: '' },
  });
  check('POST /rpa/config 保存本地店铺', local.ok === true && local.config.stores.length === 1);
  const store = local.config.stores[0];
  check('本地店铺保留 platform（否则一条作业都匹配不上）', store.platform === 'pdd', `platform=${store.platform}`);
  check('端口按填写保留', store.port === 9411, `port=${store.port}`);
  check('档案目录自动补全', /rpa-center\/profiles\//.test(store.profileDir || ''), store.profileDir);

  const s3 = await call('GET', '/rpa/state');
  check('source=local 时 /state 返回这家店', s3.stores.length === 1 && s3.stores[0].name === '本地测试店');
  check('/state 的 config.stores 是原始本地列表（不是合并结果）', s3.config.stores.length === 1 && s3.config.stores[0].id === store.id);

  const { resolveJobIds } = await import('../lib/runner.mjs');
  const jobIds = resolveJobIds({ jobs: {} }, { platform: 'pdd' }, null);
  check('本地店铺能匹配到作业', jobIds.length > 0, `${jobIds.length} 条`);

  // 多店铺端口不撞
  const many = await call('POST', '/rpa/config', { source: 'local', stores: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], push: { enabled: false, url: '' } });
  const ports = many.config.stores.map((x) => x.port);
  check('多家店铺自动分配不重复端口', new Set(ports).size === ports.length, ports.join(','));

  // 定时任务：多条规则 + 到点判定 + 真的触发
  const sched = await import('../lib/schedule.mjs');
  check('空配置没有规则', sched.normalizeRules({}).length === 0);
  const migrated = sched.normalizeRules({ enabled: true, time: '7:5', jobs: ['bill_guonei'] });
  check('老的单条配置自动升级成一条规则', migrated.length === 1 && migrated[0].time === '07:05', JSON.stringify(migrated[0] && migrated[0].time));
  const two = sched.normalizeRules({ rules: [{ name: '账单', enabled: true, time: '08:00' }, { name: '推广', enabled: true, time: '12:30', days: [1, 2] }, {}] });
  check('支持多条规则', two.length === 3 && two[0].name === '账单' && two[2].name === '任务 3');
  check('规则 id 不重复', new Set(two.map((r) => r.id)).size === two.length);

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const hhmm = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  const due = sched.normalizeRule({ enabled: true, time: hhmm, days: [today.getDay()] });
  check('到点 + 今天没跑过 → 该跑', sched.shouldRun(due, '').run === true);
  check('今天已跑过 → 不再跑', sched.shouldRun(due, todayKey).reason === 'already-ran-today');
  check('不在勾选的星期 → 不跑', sched.shouldRun(sched.normalizeRule({ enabled: true, time: hhmm, days: [(today.getDay() + 1) % 7] }), '').reason === 'not-a-scheduled-day');
  check('关掉就不跑', sched.shouldRun(sched.normalizeRule({ enabled: false }), '').reason === 'disabled');
  const next = sched.nextRunAt({ rules: [sched.normalizeRule({ enabled: true, time: '23:59' })] });
  check('能给下次运行时间', typeof next === 'string', next || '');

  // 真跑一遍 tick：两条规则都到点，应该各跑一次
  const past = new Date(Date.now() - 60000);
  const pastHHMM = `${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}`;
  await call('POST', '/rpa/config', {
    source: 'local',
    stores: [{ name: '定时测试店', port: 9333 }],
    push: { enabled: false, url: '' },
    schedule: {
      rules: [
        { id: 'r1', name: '规则一', enabled: true, time: pastHHMM, days: [today.getDay()], jobs: ['bill_guonei'] },
        { id: 'r2', name: '规则二', enabled: true, time: pastHHMM, days: [today.getDay()], jobs: ['bill_guowai'] },
        { id: 'r3', name: '没开', enabled: false, time: pastHHMM, days: [today.getDay()] },
      ],
    },
  });
  let fired = [];
  const stop = sched.startScheduler({ runJobs: async (rule) => { fired.push(rule.id); return [{ runs: [{ ok: true }] }]; }, intervalMs: 5000, log: () => {} });
  await new Promise((r) => setTimeout(r, 6500));
  stop();
  const st = sched.readScheduleState();
  check('两条到点的规则各触发一次（未启用的不跑）', fired.length === 2 && fired.includes('r1') && fired.includes('r2') && !fired.includes('r3'), fired.join(','));
  check('每条规则各自记录 lastRunDate/lastResult', st.rules.r1 && st.rules.r1.lastRunDate === todayKey && st.rules.r2 && st.rules.r2.lastRunDate === todayKey);

  // 坏 URL 不该被收进配置（只允许 http/https）
  const badPush = await call('POST', '/rpa/config', { pushes: {}, push: { enabled: true, url: 'file:///etc/passwd' } });
  check('file:// 推送地址被拒收', badPush.config.push.url === '');
} catch (err) {
  console.error('✗ 自检中断：', err && err.stack ? err.stack : err);
  bad += 1;
} finally {
  fs.rmSync(tmpHome, { recursive: true, force: true });
}

console.log(bad ? `\n自检失败 ${bad} 项` : '\n自检通过');
process.exit(bad ? 1 : 0);
