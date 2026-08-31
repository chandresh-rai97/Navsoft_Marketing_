// Efforts vs Outcome — pure helpers that mirror the Excel template's formulas.

// ---- month helpers ('YYYY-MM' keys sort lexicographically) ----
export function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthAdd(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
export function monthRange(fromKey, toKey) {
  const out = [];
  let k = fromKey;
  while (k <= toKey) {
    out.push(k);
    k = monthAdd(k, 1);
    if (out.length > 240) break; // safety
  }
  return out;
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// Compute every cell for a channel. `monthsSorted` is the FULL ordered month
// list (so Carried In chains correctly even when only a slice is displayed).
// Returns cells[metricId][monthKey] = { base, carriedIn, total, achieved, attain, toCarry, firstMonth, entry }.
export function computeChannel(metrics, monthsSorted, entries) {
  const entryMap = {};
  for (const e of entries) (entryMap[e.metric_id] = entryMap[e.metric_id] || {})[e.month] = e;

  const cells = {};
  for (const m of metrics) {
    cells[m.id] = {};
    let prevToCarry = 0;
    monthsSorted.forEach((mk, i) => {
      const e = (entryMap[m.id] || {})[mk] || {};
      const base = num(e.base_target);
      const achieved = num(e.achieved);
      // First month: opening backlog is the entered value (default 0).
      // Later months: Carried In = previous month's To Carry.
      const carriedIn = i === 0 ? num(e.carried_in) ?? 0 : prevToCarry;
      const total = (base ?? 0) + carriedIn; // blank base counts as 0 (=E+F)
      let attain = null;
      if (achieved !== null) {
        if (m.direction === "higher") attain = total === 0 ? null : achieved / total;
        else attain = achieved === 0 ? null : total / achieved;
      }
      const toCarry = m.carry && achieved !== null ? Math.max(total - achieved, 0) : 0;
      cells[m.id][mk] = { base, carriedIn, total, achieved, attain, toCarry, firstMonth: i === 0, entry: e };
      prevToCarry = toCarry;
    });
  }
  return cells;
}

// Traffic-light class for an attainment ratio: >=1 green, 0.8–<1 yellow, <0.8 red.
export function attainColor(attain) {
  if (attain === null || attain === undefined) return "";
  if (attain >= 1) return "eo-green";
  if (attain >= 0.8) return "eo-yellow";
  return "eo-red";
}

export function fmtPct(attain) {
  if (attain === null || attain === undefined) return "";
  return Math.round(attain * 100) + "%";
}
export function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

// Dashboard rollup for one channel in one month.
export function channelMonthSummary(metrics, cells, monthKey) {
  const attainsOf = (section) =>
    metrics
      .filter((m) => m.section === section)
      .map((m) => cells[m.id]?.[monthKey]?.attain)
      .filter((a) => a !== null && a !== undefined);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const effortPct = avg(attainsOf("effort"));
  const outcomePct = avg(attainsOf("outcome"));
  const carriedFwd = metrics
    .filter((m) => m.section === "effort")
    .reduce((s, m) => s + (cells[m.id]?.[monthKey]?.toCarry || 0), 0);
  const lagging = metrics.filter((m) => {
    const a = cells[m.id]?.[monthKey]?.attain;
    return a !== null && a !== undefined && a > 0 && a < 1;
  }).length;
  return { effortPct, outcomePct, carriedFwd, lagging };
}
