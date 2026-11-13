/**
 * 页面文本 → 指标。规则和踩过的坑：
 *   - 金额带千分位（2,625.80），不能只取到逗号前；
 *   - 大数会缩写成「1.8 万」，要乘回去；
 *   - 标签左边不能紧贴汉字，否则「成交笔数」会先命中「净成交笔数」；
 *   - 「昨日/对比」那一列紧跟在后面，只取第一个数（本次值）。
 */

const CJK = '\\u4e00-\\u9fff';
const NUM = '([-+]?(?:[0-9]{1,3}(?:,[0-9]{3}){1,}|[0-9]+)(?:\\.[0-9]+)?)';
const UNIT = /^\s*(万|亿|千)/;

export function parseMetrics(text, specs) {
  const src = String(text == null ? '' : text);
  const values = {};
  const missing = [];
  for (const spec of specs) {
    const label = String(spec.label || '');
    if (!label) continue;
    const re = new RegExp(`(?<![${CJK}])${escapeRe(label)}\\s*${NUM}`);
    const hit = re.exec(src);
    if (!hit) { missing.push(spec.label); continue; }
    const unit = (UNIT.exec(src.slice(hit.index + hit[0].length)) || [])[1];
    const scale = unit === '万' ? 1e4 : unit === '亿' ? 1e8 : unit === '千' ? 1e3 : 1;
    const value = Number(String(hit[1]).replace(/,/g, '')) * scale;
    if (!Number.isFinite(value)) { missing.push(spec.label); continue; }
    values[spec.label] = value;
  }
  return { values, missing };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** CSV 解析（PDD 导出是逗号分隔、可能带 BOM/引号）。 */
export function parseCsv(text) {
  const src = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  const records = rows
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [String(h).trim(), r[i] === undefined ? '' : String(r[i]).trim()])));
  return { header: head.map((h) => String(h).trim()), records };
}
