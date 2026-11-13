/**
 * 指标落地：指标类作业跑完不止存在运行记录里，还会写两份东西 ——
 *   1) 快照 JSON（一次运行一个文件，给后端/BI 直接吃）
 *   2) 追加快照 CSV（长表：一行一个指标，方便 Excel / pandas / SQL 导入）
 * 这就是「指标项之后怎么用」的答案：推送（可选）+ 本地台账（默认）+ 快照。
 */
import fs from 'node:fs';
import path from 'node:path';
import { files } from './state.mjs';

const HEAD = ['ts', 'storeId', 'storeName', 'platform', 'jobId', 'rangeStart', 'rangeEnd', 'key', 'label', 'value'];

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function metricsCsvPath() {
  return path.join(files.data(), 'metrics.csv');
}

/** 清空指标台账 CSV（长表）。不存在的快照 JSON 不动。返回是否确有文件被删。 */
export function clearMetrics() {
  const csv = metricsCsvPath();
  if (!fs.existsSync(csv)) return false;
  fs.unlinkSync(csv);
  return true;
}

export function recordMetrics(entry) {
  if (!entry || !Array.isArray(entry.metrics) || !entry.metrics.length) return null;
  try {
    const dir = path.join(files.data(), entry.storeId, entry.jobId);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = String(entry.ts || new Date().toISOString()).replace(/[:.]/g, '-');
    const snapshot = path.join(dir, `${stamp}.json`);
    fs.writeFileSync(snapshot, JSON.stringify({
      ts: entry.ts,
      store: { id: entry.storeId, name: entry.storeName },
      platform: entry.platform,
      job: { id: entry.jobId, name: entry.jobName },
      range: entry.range || null,
      metrics: entry.metrics,
    }, null, 2) + '\n', 'utf8');

    const csv = metricsCsvPath();
    const exists = fs.existsSync(csv);
    const rows = entry.metrics.map((m) => [
      entry.ts, entry.storeId, entry.storeName, entry.platform, entry.jobId,
      entry.range && entry.range.start, entry.range && entry.range.end,
      m.key, m.label, m.value,
    ].map(cell).join(','));
    fs.appendFileSync(csv, (exists ? '' : `${HEAD.join(',')}\n`) + rows.join('\n') + '\n', 'utf8');

    // 本次运行单独一份 CSV：指标类作业也要「有东西可下载」（Excel 直接双击能开）
    const runCsv = path.join(dir, `${stamp}-metrics.csv`);
    try {
      fs.writeFileSync(runCsv, `\ufeff${HEAD.join(',')}\n${rows.join('\n')}\n`, 'utf8');
    } catch { /* 写不出来就只留台账，不影响主流程 */ }
    const runCsvReady = fs.existsSync(runCsv);
    return {
      snapshot, csv, rows: rows.length,
      runCsv: runCsvReady ? { path: runCsv, name: path.basename(runCsv), bytes: fs.statSync(runCsv).size } : null,
    };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

/** 读台账（长表 CSV → 记录数组）。只支持按店铺/作业过滤，够界面和下游查最近数据用。 */
export function readMetrics({ storeId, jobId, limit = 200 } = {}) {
  const csv = metricsCsvPath();
  let text = '';
  try { text = fs.readFileSync(csv, 'utf8'); } catch { return { rows: [], total: 0, path: csv }; }
  const lines = text.split('\n').filter(Boolean);
  const head = (lines.shift() || '').split(',').map((s) => s.trim());
  const rows = [];
  for (const line of lines) {
    const cells = parseLine(line);
    const row = Object.fromEntries(head.map((h, i) => [h, cells[i] === undefined ? '' : cells[i]]));
    if (storeId && row.storeId !== storeId) continue;
    if (jobId && row.jobId !== jobId) continue;
    rows.push(row);
  }
  const total = rows.length;
  return { rows: rows.slice(-Math.max(1, Number(limit) || 200)), total, path: csv, head };
}

function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
