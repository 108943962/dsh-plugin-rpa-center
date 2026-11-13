/**
 * dsh-plugin-rpa-center —— 客户端半身：左侧栏入口 + 面板。
 *
 * 打包格式：classic script + 模块表（window.__ModuleLoader__.load）。
 * 注册两处：
 *   - sidebar.panellist：左栏那个图标入口
 *   - main：点开后占满主区的面板
 * 数据来自宿主 /rpa/*（同源 fetch，带 x-dsh-rpa-center 头）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-rpa-center',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'rpa-center';
    const NS = 'rpa-center';
    const API = '/rpa';
    const HEADERS = { 'x-dsh-rpa-center': '1' };

    const CSS = `
.rpa-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;overflow:auto}
.rpa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 10px;position:sticky;top:0;background:var(--dsw-alias-bg-base,#fff);z-index:2}
.rpa-title{font-size:18px;font-weight:600;letter-spacing:.2px}
.rpa-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#5b6270);margin-top:4px;line-height:1.6}
.rpa-body{padding:0 20px 28px;display:flex;flex-direction:column;gap:16px}
.rpa-kpis{display:flex;gap:10px;flex-wrap:wrap}
.rpa-kpi{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));border-radius:10px;padding:8px 12px;min-width:96px}
.rpa-kpi b{display:block;font-size:16px;font-weight:600}
.rpa-kpi span{font-size:11px;color:var(--dsw-alias-label-secondary,#5b6270)}
.rpa-tabs{display:flex;gap:4px;padding:8px 10px 0;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}
.rpa-tab{border:1px solid transparent;border-bottom:none;background:transparent;color:var(--dsw-alias-label-secondary,#5b6270);border-radius:8px 8px 0 0;padding:6px 12px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px}
.rpa-tab[data-on="1"]{color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06));font-weight:600}
.rpa-tab-count{font-size:10px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.16));color:var(--dsw-alias-label-secondary,#5b6270)}
.rpa-form{display:flex;flex-direction:column;gap:14px}
.rpa-field{display:flex;gap:12px;align-items:flex-start}
.rpa-field-label{width:72px;flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6270);padding-top:5px}
.rpa-field-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.rpa-radio{display:flex;gap:6px;align-items:center;font-size:12px;flex-wrap:wrap;cursor:pointer}
.rpa-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a91a0);line-height:1.5}
.rpa-input{flex:1;min-width:120px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;padding:5px 8px;font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit}
.rpa-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.rpa-card-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}
.rpa-card-hd b{font-size:13px}
.rpa-card-bd{padding:10px 14px 14px;display:flex;flex-direction:column;gap:10px}
.rpa-group-name{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#5b6270);text-transform:none;letter-spacing:.4px;margin:2px 0 -2px}
.rpa-job{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:10px;flex-wrap:wrap}
.rpa-job-main{display:flex;flex-direction:column;gap:2px;min-width:200px;flex:1}
.rpa-job-name{font-size:13px;font-weight:600}
.rpa-job-meta{font-size:11px;color:var(--dsw-alias-label-secondary,#5b6270)}
.rpa-job-last{font-size:11px;color:var(--dsw-alias-label-secondary,#5b6270)}
.rpa-store{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:10px;flex-wrap:wrap}
.rpa-store-name{font-weight:600;font-size:13px}
.rpa-pill{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));color:var(--dsw-alias-label-secondary,#5b6270)}
.rpa-pill.ok{color:var(--dsw-alias-state-success-primary,#3fb950);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#3fb950) 55%,transparent)}
.rpa-pill.warn{color:var(--dsw-alias-state-warn-primary,#b45309);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 55%,transparent)}
.rpa-pill.err{color:var(--dsw-alias-state-error-primary,#d33);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 55%,transparent)}
.rpa-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;color:inherit;border-radius:8px;padding:4px 11px;font-size:12px;cursor:pointer;white-space:nowrap}
.rpa-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08))}
.rpa-btn[disabled]{opacity:.45;cursor:not-allowed}
.rpa-btn.primary{background:var(--dsw-alias-brand-primary,#2f6feb);border-color:transparent;color:#fff}
.rpa-btn.sm{padding:3px 9px;font-size:11px}
/* 「本次运行」那排 chip：默认低调，选中才高亮（别用 .rpa-btn.primary，那个在暗色主题里是一整条黑底） */
.rpa-pickbar{display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;align-items:center}
.rpa-chip{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;color:var(--dsw-alias-label-secondary,#5b6270);border-radius:999px;padding:2px 10px;font-size:11px;line-height:18px;cursor:pointer;white-space:nowrap;font-family:inherit}
.rpa-chip:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08))}
.rpa-chip[data-on="1"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6feb) 13%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6feb) 55%,transparent);color:var(--dsw-alias-label-primary,#1f2328);font-weight:600}
.rpa-chip[data-on="1"]::before{content:"✓ ";font-size:10px}
.rpa-btn.danger{color:var(--dsw-alias-state-error-primary,#d33);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d33) 55%,transparent)}
.rpa-select{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;padding:4px 8px;font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit}
.rpa-runs{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto}
.rpa-run{display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap}
.rpa-run-when{color:var(--dsw-alias-label-secondary,#5b6270);font-size:11px;min-width:126px}
.rpa-metrics{display:flex;flex-wrap:wrap;gap:4px}
.rpa-metric{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}
.rpa-empty{font-size:12px;color:var(--dsw-alias-label-secondary,#5b6270);line-height:1.7}
.rpa-textarea{width:100%;min-height:160px;font:12px/1.5 ui-monospace,Menlo,monospace;border-radius:8px;padding:8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-1,#fff);color:inherit}
.rpa-details summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6270)}
/* 折叠：卡片 / 分组都复用 <details>，summary 里可以放标题和右侧操作 */
.rpa-card>.rpa-details>summary.rpa-card-hd{list-style:none;cursor:pointer}
.rpa-card>.rpa-details>summary.rpa-card-hd::-webkit-details-marker{display:none}
.rpa-card>.rpa-details>summary.rpa-card-hd::before{content:"▸";display:inline-block;font-size:10px;opacity:.55;transition:transform .12s}
.rpa-card>.rpa-details[open]>summary.rpa-card-hd::before{transform:rotate(90deg)}
.rpa-group>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px}
.rpa-group>summary::-webkit-details-marker{display:none}
.rpa-group>summary::before{content:"▸";display:inline-block;font-size:10px;opacity:.55;transition:transform .12s}
.rpa-group[open]>summary::before{transform:rotate(90deg)}
.rpa-group-body{display:flex;flex-direction:column;gap:8px;padding-top:6px}
.rpa-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
`;

    function ensureCss() {
      if (document.getElementById('rpa-center-css')) return;
      const tag = document.createElement('style');
      tag.id = 'rpa-center-css';
      tag.textContent = CSS;
      (document.head || document.documentElement).appendChild(tag);
    }

    function api(path, options) {
      const opts = options || {};
      const init = { method: opts.method || 'GET', headers: Object.assign({}, HEADERS), cache: 'no-store' };
      if (init.method !== 'GET') {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(opts.body || {});
      }
      return fetch(API + path, init).then(async (res) => {
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: `返回不是 JSON：${text.slice(0, 200)}` }; }
        if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      });
    }

    const fmtTime = (iso) => {
      if (!iso) return '—';
      try {
        const d = new Date(iso);
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } catch { return String(iso); }
    };
    const secs = (ms) => `${Math.round((Number(ms) || 0) / 100) / 10}s`;
    const GROUP_NAME = { promotion: '推广', finance: '财务' };

    function PanelIcon({ size }) {
      const s = Number.isFinite(size) ? size : 18;
      return h('svg', { viewBox: '0 0 24 24', width: s, height: s, 'aria-hidden': true, focusable: false, style: { display: 'block' } },
        h('rect', { x: 3.2, y: 4.6, width: 17.6, height: 14.8, rx: 2.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M3.2 9.2h17.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M7 13.4h4M7 16.4h7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
    }

    function Panel() {
      const [state, setState] = React.useState({ loading: true, data: null, error: '' });
      const [busy, setBusy] = React.useState('');
      const [note, setNote] = React.useState('');
      const [shop, setShop] = React.useState('');
      const [plat, setPlat] = React.useState('');
      const [draft, setDraft] = React.useState('');
      const [form, setForm] = React.useState({ source: 'shop-accounts', chromePath: '', stores: [], push: { enabled: false, url: '', method: 'POST', timeoutMs: 20000, includeFileBase64: true }, pushes: {}, jobs: {}, schedule: { rules: [] } });
      // 「本次运行」勾选：null = 跟着每条作业的「批量」开关走
      const [pick, setPick] = React.useState(null);
      // 折叠状态：pick=本次运行、jobs=作业目录、g:<分组>=各分组；记在 localStorage
      const [folded, setFolded] = React.useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem('rpa-center-folded') || '{}');
          return Object.assign({ pick: true }, saved || {});
        } catch { return { pick: true }; }
      });
      const isOpen = (key, dflt = true) => (folded[key] === undefined ? dflt : !folded[key]);
      // 只由 <details> 的 onToggle 回调写这里（原生开合 → 记状态）。
      // 之前 summary 上还挂了一个 onClick 去翻状态，两处一起改会互相打架：
      // 点一下「开了又立刻关回去」，看起来像点了没反应。
      const setFold = (key, open) => {
        setFolded((prev) => {
          const nextVal = !open;
          if (prev[key] === nextVal) return prev;   // 值没变就别重渲染，避免来回抖
          const next = Object.assign({}, prev, { [key]: nextVal });
          try { localStorage.setItem('rpa-center-folded', JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      };
      const [chromeState, setChromeState] = React.useState(null);

      const load = React.useCallback(() => {
        setState((prev) => ({ loading: true, data: prev.data, error: '' }));
        return api('/state')
          .then((data) => {
            setState({ loading: false, data, error: '' });
            setDraft(JSON.stringify({ source: data.source, chromePath: data.config.chromePath, push: data.config.push, platforms: data.config.platforms, stores: data.config.stores }, null, 2));
            setForm({
              source: data.source || 'shop-accounts',
              chromePath: data.config.chromePath || '',
              push: Object.assign({ enabled: false, url: '', method: 'POST', timeoutMs: 20000, includeFileBase64: true }, data.config.push || {}),
              pushes: Object.assign({}, data.config.pushes || {}),
              jobs: Object.assign({}, data.config.jobs || {}),
              stores: Array.isArray(data.config.stores) ? data.config.stores : [],
              schedule: { rules: (data.config.schedule && data.config.schedule.rules) || [] },
            });
            const plats = data.platforms || [];
            const firstPlat = plats.find((p) => p.storeCount > 0) || plats.find((p) => p.jobCount > 0) || plats[0] || null;
            setPlat((prev) => prev || (firstPlat && firstPlat.id) || '');
            setShop((prev) => prev || (data.stores[0] && data.stores[0].id) || '');
          })
          .catch((err) => setState({ loading: false, data: null, error: err.message }));
      }, []);

      React.useEffect(() => { load(); }, [load]);

      // 未登录途阳时每 10 秒刷一次状态，登录成功后自动出现作业列表。
      // 注意：这个 effect 必须放在 render 的早退之前（条件式调用 hook 会直接崩）。
      const needLoginEarly = Boolean(state.data && state.data.auth && state.data.auth.enforced && !state.data.auth.loggedIn);
      React.useEffect(() => {
        if (!needLoginEarly) return undefined;
        const t = setInterval(() => { load(); }, 10000);
        return () => clearInterval(t);
      }, [needLoginEarly, load]);

      const data = state.data;
      const stores = (data && data.stores) || [];
      const jobs = (data && data.jobs) || [];
      const groups = (data && data.groups) || [];
      const runs = (data && data.runs) || [];
      const storeOf = (id) => stores.find((s) => s.id === id) || null;
      const lastRun = (storeId, jobId) => runs.find((r) => r.storeId === storeId && r.jobId === jobId) || null;
      const todays = runs.filter((r) => r.ts && r.ts.slice(0, 10) === new Date().toISOString().slice(0, 10));
      const okToday = todays.filter((r) => r.ok).length;
      const badToday = todays.length - okToday;

      const runJobs = (storeId, jobIds, label) => {
        if (!storeId) { setNote('先选一家店铺'); return; }
        const ids = Array.isArray(jobIds) ? jobIds : selection;
        if (!ids.length) { setNote('没有勾选任何作业：先在上面勾几条，或把作业的「批量」打开'); return; }
        setBusy(storeId + ':' + ids.join(','));
        setNote(`正在跑 ${label}（${ids.length} 条）…`);
        api('/run', { method: 'POST', body: { storeId, jobs: ids } })
          .then((out) => {
            const list = out.runs || [];
            const bad = list.filter((r) => !r.ok);
            setNote(bad.length
              ? `完成，失败：${bad.map((r) => `${r.jobName}（${r.code || ''}）`).join('、')}`
              : `${label} 完成：${list.map((r) => `${r.jobName} ${secs(r.ms)}`).join(' · ')}`);
            return load();
          })
          .catch((err) => setNote(`❌ ${err.message}`))
          .finally(() => setBusy(''));
      };

      const stopRun = () => {
        setNote('已发送停止请求：当前作业会在下一次等待时退出，后面的作业不再跑');
        api('/stop', { method: 'POST', body: {} })
          .then(() => load())
          .catch((err) => setNote(`❌ ${err.message}`));
      };

      const runAllStores = () => {
        const ids = selection;
        if (!ids.length) { setNote('没有勾选任何作业：先在上面勾几条，或把作业的「批量」打开'); return; }
        setBusy('*');
        setNote(`正在按店铺顺序跑 ${ids.length} 条作业…`);
        api('/run-all', { method: 'POST', body: { jobs: ids } })
          .then((out) => {
            const batches = out.batches || [];
            let ok = 0; const bad = [];
            batches.forEach((b) => (b.runs || []).forEach((r) => { if (r.ok) ok += 1; else bad.push(`${r.storeName}/${r.jobName}`); }));
            setNote(bad.length ? `完成：成功 ${ok}，失败 ${bad.join('、')}` : `全部完成：${ok} 条`);
            return load();
          })
          .catch((err) => setNote(`❌ ${err.message}`))
          .finally(() => setBusy(''));
      };

      const openStore = (storeId) => {
        setBusy(storeId + ':open');
        api('/open', { method: 'POST', body: { storeId } })
          .then((r) => setNote(`已打开 ${storeOf(storeId)?.name || storeId}（${r.started ? '新启动' : '复用'} · 端口 ${r.port}）`))
          .catch((err) => setNote(`❌ ${err.message}`))
          .finally(() => setBusy(''));
      };

      // 清除日志：先确认清运行记录，再单独问要不要连指标台账一起清
      const clearRuns = () => {
        if (!runs.length) return;
        if (!window.confirm('确定清空「最近运行」的全部 ' + runs.length + ' 条记录吗？')) return;
        const withMetrics = window.confirm('要连「指标台账 CSV」一起清空吗？\n「确定」= 连台账一起清；「取消」= 只清运行记录');
        setBusy('clear');
        api('/clear-runs', { method: 'POST', body: { withMetrics } })
          .then((out) => {
            setNote('已清除 ' + out.removed + ' 条运行记录' + (out.metricsCleared ? '，指标台账 CSV 也一起清空了' : ''));
            return load();
          })
          .catch((err) => setNote('❌ ' + err.message))
          .finally(() => setBusy(''));
      };

      const patchForm = (patch) => setForm((prev) => Object.assign({}, prev, patch));
      const patchPush = (patch) => setForm((prev) => Object.assign({}, prev, { push: Object.assign({}, prev.push, patch) }));
      // 每条作业自己的推送接口：url 留空 = 跟着全局默认走（不占配置）
      // ── 定时任务（多条规则）────────────────────────────────────────────
      // 改动即时保存：这块改完就该生效，不用再点「保存设置」
      const saveSchedule = (next) => {
        setForm((prev) => Object.assign({}, prev, { schedule: next }));
        api('/config', { method: 'POST', body: Object.assign({}, (data && data.config) || {}, { schedule: next }) })
          .then((r) => { if (!r || r.ok === false) throw new Error((r && r.error) || '保存失败'); return load(); })
          .catch((err) => setNote(`❌ 定时任务保存失败：${err.message}`));
      };
      const rules = (form.schedule && form.schedule.rules) || [];
      const patchRules = (list) => saveSchedule({ rules: list });
      const patchRule = (id, patch) => patchRules(rules.map((r) => (r.id === id ? Object.assign({}, r, patch) : r)));
      const toggleRuleDay = (id, d) => {
        const rule = rules.find((r) => r.id === id);
        if (!rule) return;
        const cur = new Set(rule.days || []);
        if (cur.has(d)) cur.delete(d); else cur.add(d);
        patchRule(id, { days: [...cur].sort() });
      };
      const addRule = () => {
        const id = 'rule-' + Date.now().toString(36);
        patchRules(rules.concat([{ id, name: '任务 ' + (rules.length + 1), enabled: true, time: '08:30', days: [0, 1, 2, 3, 4, 5, 6], jobs: [], catchUp: true }]));
      };
      const removeRule = (id) => patchRules(rules.filter((r) => r.id !== id));
      // 危险/重动作的二次确认：第一次点变成「确认执行？」，3 秒内再点才真的执行
      const [pending, setPending] = React.useState(null);
      const confirmTimer = React.useRef(null);
      const askConfirm = (key, action) => {
        if (pending === key) {
          setPending(null);
          clearTimeout(confirmTimer.current);
          action();
          return;
        }
        setPending(key);
        clearTimeout(confirmTimer.current);
        confirmTimer.current = setTimeout(() => setPending(null), 3000);
      };
      const runScheduleNow = (ruleId) => {
        setBusy('schedule');
        setNote('正在按这条定时任务的清单跑一次…');
        api('/schedule-run', { method: 'POST', body: ruleId ? { ruleId } : {} })
          .then((out) => setNote(`跑完：${out.ok ?? 0} 成功 / ${out.failed ?? 0} 失败`))
          .catch((err) => setNote(`❌ ${err.message}`))
          .finally(() => { setBusy(''); return load(); });
      };

      // ── 本地店铺（source=local 时用）────────────────────────────────────
      const patchStore = (idx, patch) => setForm((prev) => {
        const list = (prev.stores || []).slice();
        list[idx] = Object.assign({}, list[idx], patch);
        return Object.assign({}, prev, { stores: list });
      });
      const addStore = () => setForm((prev) => {
        const platform = ((data.config && data.config.platforms) || ['pdd'])[0];
        const id = 'local-' + Date.now().toString(36);
        const list = (prev.stores || []).concat([{ id, name: '新店铺', storeId: '', platform, port: 0, profileDir: '' }]);
        return Object.assign({}, prev, { stores: list });
      });
      const removeStore = (idx) => setForm((prev) => {
        const list = (prev.stores || []).slice();
        list.splice(idx, 1);
        return Object.assign({}, prev, { stores: list });
      });

      const patchPushJob = (jobId, patch) => setForm((prev) => {
        const own = Object.assign({}, (prev.pushes || {})[jobId], patch);
        const pushes = Object.assign({}, prev.pushes, { [jobId]: own });
        return Object.assign({}, prev, { pushes });
      });
      const clearPushJob = (jobId) => setForm((prev) => {
        const pushes = Object.assign({}, prev.pushes);
        delete pushes[jobId];
        return Object.assign({}, prev, { pushes });
      });

      const saveForm = () => {
        const body = {
          source: form.source,
          chromePath: form.chromePath,
          push: form.push,
          pushes: Object.keys(form.pushes || {}).reduce((acc, id) => {
            const own = form.pushes[id];
            if (own && String(own.url || '').trim()) acc[id] = own;
            return acc;
          }, {}),
          platforms: (data.config && data.config.platforms) || undefined,
          stores: form.stores || [],
          schedule: form.schedule,
        };
        api('/config', { method: 'POST', body })
          .then(() => { setNote('设置已保存'); return load(); })
          .catch((err) => setNote(`❌ ${err.message}`));
      };

      const saveRaw = () => {
        let parsed;
        try { parsed = JSON.parse(draft); } catch (err) { setNote(`❌ 不是合法 JSON：${err.message}`); return; }
        api('/config', { method: 'POST', body: parsed })
          .then(() => { setNote('配置已保存'); return load(); })
          .catch((err) => setNote(`❌ ${err.message}`));
      };

      const checkChrome = () => {
        setChromeState({ checking: true });
        api('/check', { method: 'POST', body: { chromePath: form.chromePath } })
          .then((r) => setChromeState({ checking: false, exists: r.exists, path: r.chromePath }))
          .catch((err) => setChromeState({ checking: false, exists: false, error: err.message }));
      };

      if (state.loading && !data) return h('div', { className: 'rpa-root' }, h('div', { className: 'rpa-sub', style: { padding: 20 } }, '加载中…'));
      if (state.error) return h('div', { className: 'rpa-root' }, h('div', { className: 'rpa-sub', style: { padding: 20 } }, `读取失败：${state.error}`));

      const plats = (data && data.platforms) || [];
      const visiblePlats = plats.filter((p) => p.storeCount > 0 || p.jobCount > 0 || p.ready);
      const curPlat = plats.find((p) => p.id === plat) || visiblePlats[0] || null;
      const platStores = stores.filter((st) => !curPlat || st.platform === curPlat.id);
      const platJobs = jobs.filter((j) => !curPlat || j.platform === curPlat.id);
      const shopOfPlat = platStores.find((st) => st.id === shop) || platStores[0] || null;
      const jobsByGroup = (gid) => platJobs.filter((j) => j.group === gid);

      // ── 本次要跑哪些作业 ────────────────────────────────────────────────
      // 默认 = 开着「批量」的作业；用户在顶部 chip 里改的是「这一次」。
      const enabledIds = jobs.filter((j) => j.enabled !== false).map((j) => j.id);
      const selection = pick === null ? enabledIds : pick;
      const isPicked = (id) => selection.includes(id);
      const togglePick = (id) => setPick(() => {
        const cur = new Set(selection);
        if (cur.has(id)) cur.delete(id); else cur.add(id);
        return [...cur];
      });
      const pickAll = () => setPick(platJobs.map((j) => j.id));
      const pickNone = () => setPick([]);
      /** 把某条作业的「批量」开关写进配置（即时生效，不用点保存）。 */
      const toggleJobEnabled = (jobId, enabled) => {
        const nextJobs = Object.assign({}, (data.config && data.config.jobs) || {});
        nextJobs[jobId] = { enabled: Boolean(enabled) };
        const body = Object.assign({}, data.config || {}, { jobs: nextJobs });
        setNote(enabled ? '已加入批量运行' : '已从批量运行里移除（单条还能手动跑）');
        api('/config', { method: 'POST', body })
          .then(() => load())
          .catch((err) => setNote(`❌ ${err.message}`));
      };

      // ── 产物下载：不管作业产出的是文件还是指标，运行记录里都能点 ──
      const artifactsOf = (r) => {
        if (r && Array.isArray(r.artifacts) && r.artifacts.length) return r.artifacts;
        // 老记录兜底
        const list = [];
        if (r && r.file && r.file.path) list.push({ role: 'business', name: r.file.name, path: r.file.path });
        if (r && r.ledger && r.ledger.snapshot) list.push({ role: 'snapshot', name: 'snapshot.json', path: r.ledger.snapshot });
        return list;
      };
      const ARTIFACT_LABEL = { business: '业务文件', metrics: '指标CSV', snapshot: '快照JSON', run: '运行记录' };
      const artifactButtons = (r, opts) => {
        const list = artifactsOf(r);
        if (!list.length) return [];
        const small = opts && opts.small;
        const primary = list.find((a) => a.role === 'business') || list[0];
        const rest = list.filter((a) => a !== primary);
        return [
          h('button', {
            className: 'rpa-btn ' + (small ? 'sm' : 'primary sm'),
            key: 'dl-main',
            title: ARTIFACT_LABEL[primary.role] + '：' + primary.path,
            onClick: () => download(primary),
          }, small ? (ARTIFACT_LABEL[primary.role] || '下载') : '下载'),
          ...rest.map((a, i) => h('button', {
            className: 'rpa-btn sm',
            key: 'dl-' + i,
            title: ARTIFACT_LABEL[a.role] + '：' + a.path,
            onClick: () => download(a),
          }, ARTIFACT_LABEL[a.role] || a.role)),
        ];
      };
      const platName = (id) => {
        const pf = plats.find((x) => x.id === id);
        return pf ? pf.name : String(id || '—');
      };

      const restoreDraft = () => setDraft(JSON.stringify({
        source: data.source,
        chromePath: data.config.chromePath,
        push: data.config.push,
        pushes: data.config.pushes,
        platforms: data.config.platforms,
        stores: data.config.stores,
      }, null, 2));

      const radioRow = (label, value, hint, checked) => h('label', { className: 'rpa-radio' },
        h('input', {
          type: 'radio',
          name: 'rpa-source',
          checked,
          onChange: () => patchForm({ source: value }),
        }),
        h('span', null, label),
        h('span', { className: 'rpa-hint' }, hint));

      const settingsCard = h('div', { className: 'rpa-card' },
        h('details', { className: 'rpa-details' },
          h('summary', { style: { padding: '10px 14px' } }, '设置（点开调整；一般不用改）'),
          h('div', { className: 'rpa-card-bd' },

            h('div', { className: 'rpa-form' },
              // 店铺来源
              h('div', { className: 'rpa-field' },
                h('div', { className: 'rpa-field-label' }, '店铺来源'),
                h('div', { className: 'rpa-field-body' },
                  radioRow('跟「账号管理」共用', 'shop-accounts', '店铺、登录态、Chrome 档案都用那边的，这里不用再配（推荐）', form.source === 'shop-accounts'),
                  radioRow('只用本插件自己的店铺', 'local', '自己填店铺：名字 / 端口 / Chrome 档案目录；第一次「打开店铺」时拉起浏览器，登录一次长期复用', form.source === 'local'),
                  form.source === 'local'
                    ? h('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } },
                      h('div', { className: 'rpa-hint' },
                        '端口留空会自动分配（9200 起）；档案目录留空用 ' + '~/.dsh/rpa-center/profiles/<店铺id>'),
                      (form.stores || []).length
                        ? (form.stores || []).map((st, i) => h('div', {
                          key: st.id || i,
                          style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
                        },
                        h('input', {
                          className: 'rpa-input', style: { flex: '1 1 130px' }, placeholder: '店铺名',
                          value: st.name || '',
                          onChange: (e) => patchStore(i, { name: e.target.value }),
                        }),
                        h('input', {
                          className: 'rpa-input', style: { width: 130 }, placeholder: 'storeId（可空）',
                          value: st.storeId || '',
                          onChange: (e) => patchStore(i, { storeId: e.target.value }),
                        }),
                        h('input', {
                          className: 'rpa-input', style: { width: 84 }, placeholder: '端口',
                          value: st.port ? String(st.port) : '',
                          onChange: (e) => patchStore(i, { port: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 }),
                        }),
                        h('input', {
                          className: 'rpa-input', style: { flex: '2 1 240px' }, placeholder: 'Chrome 档案目录（可空）',
                          value: st.profileDir || '',
                          onChange: (e) => patchStore(i, { profileDir: e.target.value }),
                        }),
                        h('button', { className: 'rpa-btn sm danger', onClick: () => removeStore(i) }, '删除')))
                        : h('div', { className: 'rpa-hint' }, '还没有本地店铺：点下面的「添加店铺」'),
                      h('div', null,
                        h('button', { className: 'rpa-btn sm', onClick: addStore }, '＋ 添加店铺')))
                    : null)),

              // Chrome
              h('div', { className: 'rpa-field' },
                h('div', { className: 'rpa-field-label' }, '浏览器'),
                h('div', { className: 'rpa-field-body' },
                  h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                    h('input', {
                      className: 'rpa-input',
                      value: form.chromePath,
                      onChange: (e) => { patchForm({ chromePath: e.target.value }); setChromeState(null); },
                    }),
                    h('button', { className: 'rpa-btn sm', onClick: checkChrome }, chromeState && chromeState.checking ? '检测中…' : '检测')),
                  h('div', { className: 'rpa-hint' },
                    chromeState
                      ? (chromeState.checking ? '正在检查…'
                        : (chromeState.exists ? '✅ 找到了这个 Chrome' : '❌ 这个路径下没有 Chrome，请换成实际安装位置'))
                      : '跑作业时会用这个 Chrome 打开店铺后台（每店一个独立档案，登录一次长期复用）'))),

              // 推送
              h('div', { className: 'rpa-field' },
                h('div', { className: 'rpa-field-label' }, '结果推送（默认）'),
                h('div', { className: 'rpa-field-body' },
                  h('label', { className: 'rpa-radio' },
                    h('input', {
                      type: 'checkbox',
                      checked: Boolean(form.push.enabled),
                      onChange: (e) => patchPush({ enabled: e.target.checked }),
                    }),
                    h('span', null, '作业跑完后，把结果推送到我的接口（没单独配的作业用这个）'),
                    h('span', { className: 'rpa-hint' }, '关着就只存本地')),
                  form.push.enabled
                    ? h('div', null,
                      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                        h('span', { className: 'rpa-hint' }, '地址'),
                        h('input', {
                          className: 'rpa-input',
                          style: { flex: 1, minWidth: 260 },
                          value: form.push.url,
                          placeholder: 'http://127.0.0.1:8000/process_pdd_tuiguang_month_alert',
                          onChange: (e) => patchPush({ url: e.target.value }),
                        }),
                        h('select', {
                          className: 'rpa-select',
                          value: form.push.method,
                          onChange: (e) => patchPush({ method: e.target.value }),
                        }, ['POST', 'GET'].map((m) => h('option', { key: m, value: m }, m))),
                        h('input', {
                          className: 'rpa-input',
                          style: { width: 80 },
                          value: String(form.push.timeoutMs),
                          onChange: (e) => patchPush({ timeoutMs: Number(e.target.value.replace(/[^0-9]/g, '')) || 20000 }),
                        }),
                        h('span', { className: 'rpa-hint' }, '毫秒超时')),
                      h('label', { className: 'rpa-radio', style: { marginTop: 6 } },
                        h('input', {
                          type: 'checkbox',
                          checked: Boolean(form.push.includeFileBase64),
                          onChange: (e) => patchPush({ includeFileBase64: e.target.checked }),
                        }),
                        h('span', null, '文件类作业附带文件内容（base64）'),
                        h('span', { className: 'rpa-hint' }, '关着只推文件名和大小')),
                      h('div', { className: 'rpa-hint', style: { marginTop: 6 } },
                        'POST 发 JSON：{ store, job, range, metrics 或 file{name,size,base64} }；GET 则把 storeId/job/start/end 拼进 URL。'))
                    : null)),

              // 每个作业各自的推送接口
              h('div', { className: 'rpa-field' },
                h('div', { className: 'rpa-field-label' }, '按作业配接口'),
                h('div', { className: 'rpa-field-body' },
                  h('div', { className: 'rpa-hint' },
                    '每个 RPA 在下游可以有各自的地址（账单/订单/推广/余额各收各的）；留空就走上面的默认接口。'
                    + '地址里可以写 {task} 占位符，运行时会换成作业 id。'),
                  jobs.map((jb) => {
                    const own = (form.pushes || {})[jb.id] || {};
                    const on = Boolean(String(own.url || '').trim());
                    return h('div', {
                      key: jb.id,
                      style: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
                    },
                    h('span', {
                      className: 'rpa-hint',
                      style: { flex: '0 0 160px', width: 160 },
                      title: jb.id,
                    }, jb.name + (on ? ' · 专用' : '')),
                    h('input', {
                      className: 'rpa-input',
                      style: { flex: 1, minWidth: 220, borderColor: on ? '#2f6fed' : undefined },
                      value: own.url || '',
                      placeholder: '留空 = 用默认接口',
                      onChange: (e) => patchPushJob(jb.id, { url: e.target.value }),
                    }),
                    h('select', {
                      className: 'rpa-select',
                      value: own.method || form.push.method,
                      onChange: (e) => patchPushJob(jb.id, { method: e.target.value }),
                    }, ['POST', 'GET'].map((m) => h('option', { key: m, value: m }, m))),
                    on ? h('button', { className: 'rpa-btn sm', onClick: () => clearPushJob(jb.id) }, '清空') : null);
                  }))),

              // 平台（只读说明）
              h('div', { className: 'rpa-field' },
                h('div', { className: 'rpa-field-label' }, '平台'),
                h('div', { className: 'rpa-field-body' },
                  h('div', { className: 'rpa-hint' },
                    '已接入：' + (data.platforms || []).filter((pf) => pf.ready).map((pf) => pf.name).join('、') || '—'),
                  h('div', { className: 'rpa-hint' },
                    '未接入：' + ((data.platforms || []).filter((pf) => !pf.ready).map((pf) => pf.name).join('、') || '—') + '（接入要改代码，不在这个界面里）'))),

              h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
                h('button', { className: 'rpa-btn primary sm', onClick: saveForm }, '保存设置'),
                h('span', { className: 'rpa-hint' }, '只影响「怎么跑」，不影响已经采到的数据'))),

            // 高级：原始 JSON
            h('details', { className: 'rpa-details', style: { marginTop: 12 } },
              h('summary', { className: 'rpa-hint' }, '高级：直接改配置 JSON（改错可能跑不起来）'),
              h('div', { style: { marginTop: 8 } },
                h('textarea', { className: 'rpa-textarea', value: draft, onChange: (e) => setDraft(e.target.value) }),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' } },
                  h('button', { className: 'rpa-btn primary sm', onClick: saveRaw }, '保存 JSON'),
                  h('button', { className: 'rpa-btn sm', onClick: restoreDraft }, '恢复成当前配置'),
                  h('span', { className: 'rpa-hint' }, 'source=shop-accounts 时店铺读「账号管理」')))))));

      const fmtPill = (run) => (run ? (run.ok ? 'ok' : 'err') : '');

      const download = (file) => {
        if (!file || !file.path) return;
        setNote('正在下载 ' + (file.name || '…'));
        fetch(API + '/file?path=' + encodeURIComponent(file.path), { headers: HEADERS, cache: 'no-store' })
          .then((res) => {
            if (!res.ok) return res.text().then((t) => { throw new Error('HTTP ' + res.status + ' ' + String(t).slice(0, 120)); });
            return res.blob();
          })
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name || 'download';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            setNote('已保存 ' + (file.name || ''));
          })
          .catch((err) => setNote('❌ 下载失败：' + err.message));
      };

      const jobRow = (job) => {
        const target = shopOfPlat || null;
        const last = lastRun(target ? target.id : shop, job.id);
        const busyKey = (target ? target.id : shop) + ':' + job.id;
        const batchOn = job.enabled !== false;
        return h('div', { className: 'rpa-job', key: job.id, 'data-off': batchOn ? '0' : '1' },
          h('label', {
            className: 'rpa-radio',
            style: { flex: '0 0 auto', marginRight: 6 },
            title: batchOn ? '点一下：批量运行时不跑它' : '点一下：加入批量运行',
          },
            h('input', {
              type: 'checkbox',
              checked: batchOn,
              onChange: (e) => toggleJobEnabled(job.id, e.target.checked),
            }),
            h('span', { style: { fontSize: 12, opacity: 0.75 } }, '批量')),
          h('div', { className: 'rpa-job-main' },
            h('div', { className: 'rpa-job-name' }, job.name, batchOn ? null : h('span', { className: 'rpa-pill', style: { marginLeft: 6 } }, '批量时不跑')),
            h('div', { className: 'rpa-job-meta' },
              job.platform + ' · ' + job.rangeLabel + ' · '
              + (job.output === 'file' ? '产出文件' : '产出指标') + ' · ' + job.desc)),
          h('span', { className: 'rpa-pill ' + fmtPill(last) },
            last ? (fmtTime(last.ts) + ' ' + (last.ok ? '成功' : '失败 ' + (last.code || ''))) : '还没跑过'),
          h('button', {
            className: 'rpa-btn primary sm',
            disabled: Boolean(busy) || !target,
            title: target ? ('对「' + target.name + '」运行') : '这个平台还没有店铺',
            onClick: () => runJobs(target.id, [job.id], job.name),
          }, busy === busyKey ? '运行中…' : '运行'),
          ...artifactButtons(last, { small: true }));
      };

      const groupBlock = (g) => {
        const list = jobsByGroup(g.id);
        if (!list.length) return null;
        const key = 'g:' + g.id;
        const on = isOpen(key, true);
        const off = list.filter((j) => j.enabled === false).length;
        return h('details', {
          key: g.id,
          className: 'rpa-group',
          'data-fold': key,
          open: on,
          // React 的合成事件会沿组件树模拟冒泡：内层 <details> 的 toggle 也会打到外层，
          // 所以必须只认「发在这个元素自己身上」的 toggle（嵌套 details 的经典坑）。
          onToggle: (e) => { if (e.target !== e.currentTarget) return; setFold(key, e.target.open); },
        },
        h('summary', { className: 'rpa-group-name' },
          h('span', null, g.name),
          h('span', { className: 'rpa-hint', style: { fontWeight: 400 } },
            g.hint + ' · ' + list.length + ' 条' + (off ? `（批量跳过 ${off} 条）` : ''))),
        h('div', { className: 'rpa-group-body' }, list.map(jobRow)));
      };

      const platformTab = (pf) => h('button', {
        key: pf.id,
        className: 'rpa-tab',
        'data-on': (curPlat && curPlat.id === pf.id) ? '1' : '0',
        onClick: () => {
          setPlat(pf.id);
          const firstStore = stores.find((st) => st.platform === pf.id);
          if (firstStore) setShop(firstStore.id);
        },
      }, pf.name, h('span', { className: 'rpa-tab-count' }, String(pf.jobCount)));

      const planned = plats.filter((pf) => !visiblePlats.some((v) => v.id === pf.id));

      const emptyState = () => {
        if (!curPlat) return h('div', { className: 'rpa-empty' }, '还没有任何平台：先在「账号管理」加一家店。');
        if (!curPlat.ready) {
          return h('div', { className: 'rpa-empty' },
            curPlat.name + ' 还没接入：' + (curPlat.note || '需要补页面适配。'),
            h('div', { style: { marginTop: 6 } },
              '接入方式：lib/platforms.mjs 加平台 → lib/jobs/ 写 run 函数 → lib/jobs/index.mjs 登记一行；界面自动出现。'));
        }
        if (!platStores.length) {
          return h('div', { className: 'rpa-empty' },
            form.source === 'local'
              ? '本插件还没有「' + curPlat.name + '」店铺：去下方「设置 → 店铺来源」里添加一家（名字 / 端口 / 档案目录）并保存。'
              : '还没有「' + curPlat.name + '」店铺：去「账号管理」新增一家并登录一次，这里会自动出现。');
        }
        return null;
      };

      const jobsBody = () => emptyState() || groups.map(groupBlock);

      const storeSelect = h('select', {
        className: 'rpa-select',
        value: shopOfPlat ? shopOfPlat.id : '',
        onChange: (e) => setShop(e.target.value),
      }, platStores.length
        ? platStores.map((st) => h('option', { key: st.id, value: st.id }, st.name))
        : [h('option', { key: '__none', value: '' }, '（这个平台还没有店铺）')]);

      const jobsOpen = isOpen('jobs', true);
      const jobsCard = h('div', { className: 'rpa-card' },
        h('div', { className: 'rpa-tabs' }, visiblePlats.map(platformTab)),
        h('details', {
          className: 'rpa-details',
          'data-fold': 'jobs',
          open: jobsOpen,
          onToggle: (e) => { if (e.target !== e.currentTarget) return; setFold('jobs', e.target.open); },
        },
        h('summary', { className: 'rpa-card-hd' },
          h('b', null, (curPlat ? curPlat.name : '') + ' · 作业目录'),
          h('span', { className: 'rpa-sub', style: { marginTop: 0 } },
            curPlat ? (curPlat.jobCount + ' 个作业 · ' + curPlat.backend) : ''),
          h('div', {
            'data-nofold': '1',
            style: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' },
            onClick: (e) => e.stopPropagation(),
          },
            h('span', { className: 'rpa-sub', style: { marginTop: 0 } }, '店铺'),
            storeSelect)),
        h('div', { className: 'rpa-card-bd' }, jobsBody())),
        planned.length
          ? h('div', { className: 'rpa-card-hd', style: { borderTop: '1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))', borderBottom: 'none' } },
            h('span', { className: 'rpa-sub', style: { marginTop: 0 } },
              '待接入：' + planned.map((pf) => pf.name).join('、')))
          : null);

      const storeRow = (st) => {
        const mine = runs.filter((r) => r.storeId === st.id);
        const last = mine[0] || null;
        return h('div', { className: 'rpa-store', key: st.id },
          h('div', { className: 'rpa-job-main' },
            h('div', { className: 'rpa-store-name' }, st.name),
            h('div', { className: 'rpa-job-meta' }, st.platform + ' · 端口 ' + st.port + ' · ' + st.profileDir)),
          h('span', { className: 'rpa-pill' }, platName(st.platform)),
          h('span', { className: 'rpa-pill ' + fmtPill(last) },
            last ? ('上次 ' + fmtTime(last.ts) + ' ' + (last.ok ? '成功' : '失败')) : '还没跑过'),
          h('button', {
            className: 'rpa-btn sm',
            disabled: Boolean(busy),
            onClick: () => openStore(st.id),
          }, busy === st.id + ':open' ? '打开中…' : '打开店铺'),
          h('button', {
            className: 'rpa-btn primary sm',
            disabled: Boolean(busy),
            onClick: () => runJobs(st.id, null, st.name + ' 全部作业'),
          }, busy === st.id + ':all' ? '运行中…' : '跑全部作业'));
      };

      const storesCard = h('div', { className: 'rpa-card' },
        h('div', { className: 'rpa-card-hd' },
          h('b', null, '店铺'),
          h('span', { className: 'rpa-sub', style: { marginTop: 0 } }, '与「账号管理」共用档案，登录一次长期复用')),
        h('div', { className: 'rpa-card-bd' },
          stores.length ? stores.map(storeRow) : h('div', { className: 'rpa-empty' }, '暂无店铺')));

      const runRow = (r, i) => h('div', { className: 'rpa-run', key: i },
        h('span', { className: 'rpa-run-when' }, fmtTime(r.ts)),
        h('span', { className: 'rpa-pill ' + (r.ok ? 'ok' : 'err') }, r.ok ? 'OK' : (r.code || 'FAIL')),
        h('span', { className: 'rpa-pill' }, platName(r.platform)),
        h('span', null, r.storeName + ' · ' + r.jobName + ' · ' + secs(r.ms)),
        r.file
          ? h('span', { className: 'rpa-hint', title: r.file.path }, r.file.name)
          : null,
        ...artifactButtons(r, { small: true }),
        r.metrics && r.metrics.length
          ? h('span', { className: 'rpa-metrics' }, r.metrics.slice(0, 5).map((m, k) => h('span', { className: 'rpa-metric', key: k }, m.label + '=' + m.value)))
          : null,
        // 推送结果：哪条作业推到哪个接口、成没成，都在这一小块里
        r.push
          ? h('span', {
            className: 'rpa-pill ' + (r.push.skipped ? '' : (r.push.ok ? 'ok' : 'err')),
            title: r.push.url || r.push.error || r.push.reason || '',
          }, r.push.skipped
            ? '未推送'
            : ('推送' + (r.push.source === 'job' ? '·专用' : '') + (r.push.ok ? '✓' : '✗')))
          : null,
        !r.ok ? h('span', { className: 'rpa-sub', style: { marginTop: 0 } }, r.error || '') : null);

      const runsCard = h('div', { className: 'rpa-card' },
        h('div', { className: 'rpa-card-hd' },
          h('b', null, '最近运行'),
          h('span', { className: 'rpa-sub', style: { marginTop: 0 } }, '最近 ' + Math.min(runs.length, 12) + ' 条'),
          h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' } },
            h('span', { className: 'rpa-sub', style: { marginTop: 0 } }, '指标台账：一行一个指标'),
            h('button', {
              className: 'rpa-btn sm',
              onClick: () => download({ path: data.metricsCsv, name: 'metrics.csv' }),
            }, '下载 CSV'),
            h('button', {
              className: 'rpa-btn sm danger',
              disabled: Boolean(busy) || !runs.length,
              onClick: clearRuns,
            }, busy === 'clear' ? '清除中…' : '清除记录'))),
        h('div', { className: 'rpa-card-bd' },
          runs.length
            ? h('div', { className: 'rpa-runs' }, runs.slice(0, 12).map(runRow))
            : h('div', { className: 'rpa-empty' }, '还没有运行记录')));

      const head = h('div', { className: 'rpa-head' },
        h('div', null,
          h('div', { className: 'rpa-title' }, 'RPA 中心'),
          h('div', { className: 'rpa-sub' },
            '作业 × 店铺：推广数据、财务账单，以及后续所有自动化都收在这里'
            + ((data && data.auth && data.auth.enforced && data.auth.loggedIn && data.auth.user && data.auth.user.name)
              ? ' · 途阳：' + data.auth.user.name : ''))),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          h('button', { className: 'rpa-btn', onClick: load, disabled: Boolean(busy) }, '刷新'),
          (busy || data.running)
            ? h('button', { className: 'rpa-btn danger', onClick: stopRun }, '停止')
            : null,
          h('button', { className: 'rpa-btn primary', onClick: runAllStores, disabled: Boolean(busy) || !stores.length },
            busy === '*' ? '运行中…' : '全部店铺跑一遍')));

      // ── 运行计划：本次跑哪些 + 定时任务（可多条）──────────────────────────
      const planOpen = isOpen('plan', false);
      const schedState = (data && data.schedule) || {};
      const schedRules = schedState.rules || [];
      const enabledRules = schedRules.filter((r) => r.enabled);
      const planSummary = [
        `本次 ${selection.length}/${jobs.length}`,
        enabledRules.length
          ? `定时 ${enabledRules.length} 条` + (schedState.nextRunAt ? `（下次 ${fmtTime(schedState.nextRunAt)}）` : '')
          : '定时未启用',
      ].join(' · ');

      const ruleRow = (rule) => {
        const st = rule.state || {};
        const last = st.lastResult;
        const on = Boolean(rule.enabled);
        return h('div', {
          key: rule.id,
          style: {
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '8px 10px', borderRadius: 10,
            border: '1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))',
            background: 'var(--dsw-alias-bg-layer-2,rgba(128,128,128,.04))',
          },
        },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('label', { className: 'rpa-radio', style: { flex: '0 0 auto' } },
            h('input', { type: 'checkbox', checked: on, onChange: (e) => patchRule(rule.id, { enabled: e.target.checked }) }),
            h('span', null, '启用')),
          h('input', {
            className: 'rpa-input',
            style: { flex: '0 0 120px', width: 120, minWidth: 120 },
            value: rule.name,
            placeholder: '任务名',
            onChange: (e) => patchRule(rule.id, { name: e.target.value }),
          }),
          h('input', {
            className: 'rpa-input',
            type: 'time',
            style: { flex: '0 0 104px', width: 104, minWidth: 104 },
            value: rule.time,
            disabled: !on,
            onChange: (e) => patchRule(rule.id, { time: e.target.value || '08:30' }),
          }),
          h('div', { className: 'rpa-pickbar', style: on ? undefined : { opacity: 0.45 } },
            [1, 2, 3, 4, 5, 6, 0].map((d) => h('button', {
              key: d,
              className: 'rpa-chip',
              'data-on': (rule.days || []).includes(d) ? '1' : '0',
              disabled: !on,
              style: on ? undefined : { cursor: 'not-allowed' },
              onClick: () => on && toggleRuleDay(rule.id, d),
            }, '日一二三四五六'[d]))),
          h('label', { className: 'rpa-radio', style: { flex: '0 0 auto' } },
            h('input', { type: 'checkbox', checked: Boolean(rule.catchUp), disabled: !on, onChange: (e) => patchRule(rule.id, { catchUp: e.target.checked }) }),
            h('span', null, '补跑')),
          h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
            h('button', {
              className: 'rpa-btn sm' + (pending === 'run:' + rule.id ? ' danger' : ''),
              disabled: Boolean(busy),
              onClick: () => askConfirm('run:' + rule.id, () => runScheduleNow(rule.id)),
            }, busy === 'schedule' ? '执行中…' : (pending === 'run:' + rule.id ? '确认执行？' : '立即执行')),
            h('button', {
              className: 'rpa-btn sm danger',
              onClick: () => askConfirm('del:' + rule.id, () => removeRule(rule.id)),
            }, pending === 'del:' + rule.id ? '确认删除？' : '删除'))),
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { className: 'rpa-hint' },
            (rule.jobs || []).length
              ? `跑这 ${rule.jobs.length} 条：${rule.jobs.join('、')}`
              : '跑哪些：跟着每条作业的「批量」开关'),
          h('button', { className: 'rpa-btn sm', onClick: () => patchRule(rule.id, { jobs: selection }) }, '用当前勾选'),
          h('button', { className: 'rpa-btn sm', onClick: () => patchRule(rule.id, { jobs: [] }) }, '清空'),
          last && st.lastRunAt
            ? h('span', { className: 'rpa-hint' },
              '上次 ' + fmtTime(st.lastRunAt) + (last.runs !== undefined ? `（成功 ${last.ok} / 失败 ${last.failed}）` : (last.error ? `（出错：${String(last.error).slice(0, 30)}）` : '')))
            : null));
      };

      const runPlanCard = h('div', { className: 'rpa-card' },
        h('details', {
          className: 'rpa-details',
          'data-fold': 'plan',
          open: planOpen,
          onToggle: (e) => { if (e.target !== e.currentTarget) return; setFold('plan', e.target.open); },
        },
        h('summary', { className: 'rpa-card-hd' },
          h('b', null, '运行计划'),
          h('span', { className: 'rpa-sub', style: { marginTop: 0 } }, planSummary),
          h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6 }, onClick: (e) => e.stopPropagation() },
            h('button', {
              className: 'rpa-btn sm' + (pending === 'run:first' ? ' danger' : ''),
              disabled: Boolean(busy) || !schedRules.length,
              onClick: () => askConfirm('run:first', () => runScheduleNow()),
            }, busy === 'schedule' ? '执行中…' : (pending === 'run:first' ? '确认执行？' : '立即执行')))),
        h('div', { className: 'rpa-card-bd' },

          // ① 本次运行
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
            h('span', { className: 'rpa-hint', style: { marginTop: 0 } }, '本次运行'),
            h('button', { className: 'rpa-btn sm', onClick: pickAll }, '全选'),
            h('button', { className: 'rpa-btn sm', onClick: pickNone }, '清空'),
            pick === null
              ? h('span', { className: 'rpa-hint' }, '＝每条作业的「批量」开关')
              : h('button', { className: 'rpa-btn sm', onClick: () => setPick(null) }, '恢复默认')),
          h('div', { className: 'rpa-pickbar' },
            platJobs.map((j) => h('button', {
              key: j.id,
              className: 'rpa-chip',
              'data-on': isPicked(j.id) ? '1' : '0',
              title: j.platform + ' · ' + j.rangeLabel + ' · ' + j.desc,
              onClick: () => togglePick(j.id),
            }, j.name))),

          // ② 定时任务（多条）
          h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))', margin: '4px 0' } }),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            h('span', { className: 'rpa-hint', style: { marginTop: 0 } }, '定时任务'),
            h('span', { className: 'rpa-hint' }, '到点自动跑；DSH 没开着不会跑，下次启动当天补一次'),
            h('div', { style: { marginLeft: 'auto' } },
              h('button', { className: 'rpa-btn sm', onClick: addRule }, '＋ 添加任务'))),
          rules.length
            ? rules.map(ruleRow)
            : h('div', { className: 'rpa-hint' }, '还没有定时任务：点「＋ 添加任务」，或在任意一条规则上「立即执行」验证清单'))));

      const kpis = h('div', { className: 'rpa-kpis' },
        h('div', { className: 'rpa-kpi' }, h('b', null, String(visiblePlats.length)), h('span', null, '平台')),
        h('div', { className: 'rpa-kpi' }, h('b', null, String(stores.length)), h('span', null, '店铺')),
        h('div', { className: 'rpa-kpi' }, h('b', null, String(jobs.length)), h('span', null, '作业')),
        h('div', { className: 'rpa-kpi' }, h('b', { style: { color: 'var(--dsw-alias-state-success-primary,#3fb950)' } }, String(okToday)), h('span', null, '今日成功')),
        h('div', { className: 'rpa-kpi' }, h('b', { style: { color: badToday ? 'var(--dsw-alias-state-error-primary,#d33)' : undefined } }, String(badToday)), h('span', null, '今日失败')));

      // 登录门槛：未登录时整块功能都不显示，只留一张提示卡（并 10 秒轮一次，登录后自动出现）
      const authInfo = (data && data.auth) || {};
      const needLogin = Boolean(authInfo.enforced && !authInfo.loggedIn);

      const loginCard = h('div', { className: 'rpa-card' },
        h('div', { className: 'rpa-card-hd' },
          h('b', null, '需要先登录途阳'),
          h('span', { className: 'rpa-sub', style: { marginTop: 0 } },
            authInfo.reason === 'token-expired' ? '登录已过期，请重新登录' : '当前未登录')),
        h('div', { className: 'rpa-card-bd' },
          h('div', { className: 'rpa-hint' },
            'RPA 中心需要「途阳管理系统账号」登录后才能使用：点右上角（或侧栏）的「登录途阳」完成登录，'
            + '这个页面每 10 秒刷新一次，登录成功后会自动出现作业列表。'),
          h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
            h('button', { className: 'rpa-btn sm', onClick: load }, '我已登录，刷新'))));

      if (needLogin) {
        return h('div', { className: 'rpa-root' },
          head,
          h('div', { className: 'rpa-body' },
            note ? h('div', { className: 'rpa-sub' }, note) : null,
            loginCard));
      }

      return h('div', { className: 'rpa-root' },
        head,
        h('div', { className: 'rpa-body' },
          note ? h('div', { className: 'rpa-sub' }, note) : null,
          kpis,
          runPlanCard,
          jobsCard,
          storesCard,
          runsCard,
          settingsCard));

    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureCss();
        const locale = ctx.get ? ctx.get('locale') : null;
        const label = () => 'RPA 中心';
        if (locale && typeof locale.register === 'function') {
          try { ctx.effect(() => locale.register(NS, 'zh', { panel: 'RPA 中心' }), 'rpa-center: zh'); } catch { /* ignore */ }
        }
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 25, locale: NS, label }, PanelIcon),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Panel),
        );
      },
    };
  },
});
