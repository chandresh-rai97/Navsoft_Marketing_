// Efforts vs Outcome — pure helpers that mirror the Excel template's formulas.

// The section is limited to exactly these four channels (matched to projects by
// name, case/space-insensitive). Order here is the display order.
export const EO_CHANNELS = ["Email Marketing", "SEO", "Performance Marketing", "Social Media"];
const EO_ALLOWED = new Set(EO_CHANNELS.map((n) => n.toLowerCase()));
export function isAllowedChannel(name) {
  return EO_ALLOWED.has((name || "").trim().toLowerCase());
}
// Return the allowed channel projects in canonical order.
export function allowedChannels(projects) {
  return EO_CHANNELS.map((n) => projects.find((p) => (p.name || "").trim().toLowerCase() === n.toLowerCase())).filter(
    Boolean
  );
}

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

// ---- week period helpers (key 'YYYY-MM-W#', # is 1..N within a month) ----
export function weekMonth(key) {
  return key.slice(0, 7); // '2026-08-W3' -> '2026-08'
}
export function weekNum(key) {
  const m = key.match(/-W(\d+)$/);
  return m ? Number(m[1]) : 0;
}
export function makeWeekKey(month, n) {
  return `${month}-W${n}`;
}
export function weekLabel(key) {
  return `${monthLabel(weekMonth(key))} (Week ${weekNum(key)})`;
}
export function isWeekKey(key) {
  return /-W\d+$/.test(key);
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

// Full compute with weekly source-of-truth + monthly rollup.
//   months: sorted month keys · weeks: sorted week keys · entries: all eo_entries
//   for the channel (each has .granularity 'month'|'week' and .month = period key).
// Returns { monthCells, weekCells } shaped like computeChannel's cells, where a
// month WITH weeks derives base/achieved (SUM for Carry?=Yes, AVERAGE for
// Carry?=No), carriedIn from the prior month, and toCarry from its last week.
export function computeChannelV2(metrics, months, weeks, entries) {
  const monthEnt = {}; // metricId -> monthKey -> entry
  const weekEnt = {}; //  metricId -> weekKey  -> entry
  for (const e of entries) {
    if (e.granularity === "week") (weekEnt[e.metric_id] = weekEnt[e.metric_id] || {})[e.month] = e;
    else (monthEnt[e.metric_id] = monthEnt[e.metric_id] || {})[e.month] = e;
  }
  const weeksByMonth = {};
  for (const w of weeks) (weeksByMonth[weekMonth(w)] = weeksByMonth[weekMonth(w)] || []).push(w);
  Object.values(weeksByMonth).forEach((a) => a.sort((x, y) => weekNum(x) - weekNum(y)));

  const ratio = (dir, total, achieved) => {
    if (achieved === null) return null;
    return dir === "higher" ? (total === 0 ? null : achieved / total) : achieved === 0 ? null : total / achieved;
  };

  const monthCells = {};
  const weekCells = {};
  for (const m of metrics) {
    monthCells[m.id] = {};
    weekCells[m.id] = {};
    let prevMonthToCarry = 0;
    months.forEach((mk, i) => {
      const openingEntry = monthEnt[m.id]?.[mk] || {};
      const monthCarriedIn = i === 0 ? num(openingEntry.carried_in) ?? 0 : prevMonthToCarry;
      const wkeys = weeksByMonth[mk] || [];
      let monthBase, monthAchieved, monthToCarry;

      if (wkeys.length) {
        // week mode: chain the weeks, seeded by the month's Carried In
        let prevWeekToCarry = monthCarriedIn;
        const baseVals = [];
        const achVals = [];
        let baseSum = 0;
        let achSum = 0;
        let anyAch = false;
        wkeys.forEach((wk, j) => {
          const we = weekEnt[m.id]?.[wk] || {};
          const wBase = num(we.base_target);
          const wAch = num(we.achieved);
          const wCarriedIn = prevWeekToCarry;
          const wTotal = (wBase ?? 0) + wCarriedIn;
          const wAttain = ratio(m.direction, wTotal, wAch);
          const wToCarry = m.carry && wAch !== null ? Math.max(wTotal - wAch, 0) : 0;
          weekCells[m.id][wk] = {
            base: wBase, carriedIn: wCarriedIn, total: wTotal, achieved: wAch,
            attain: wAttain, toCarry: wToCarry, firstOfChannel: i === 0 && j === 0, month: mk, entry: we,
          };
          prevWeekToCarry = wToCarry;
          baseSum += wBase ?? 0;
          if (wBase !== null) baseVals.push(wBase);
          if (wAch !== null) { achSum += wAch; anyAch = true; achVals.push(wAch); }
        });
        if (m.carry) {
          // volume metric → SUM
          monthBase = baseSum;
          monthAchieved = anyAch ? achSum : null;
        } else {
          // rate metric → AVERAGE of the entered weeks
          monthBase = baseVals.length ? baseVals.reduce((a, b) => a + b, 0) / baseVals.length : null;
          monthAchieved = achVals.length ? achVals.reduce((a, b) => a + b, 0) / achVals.length : null;
        }
        monthToCarry = prevWeekToCarry; // last week's To Carry
      } else {
        // month mode: entered directly
        monthBase = num(openingEntry.base_target);
        monthAchieved = num(openingEntry.achieved);
        const tot = (monthBase ?? 0) + monthCarriedIn;
        monthToCarry = m.carry && monthAchieved !== null ? Math.max(tot - monthAchieved, 0) : 0;
      }

      const monthTotal = (monthBase ?? 0) + monthCarriedIn;
      monthCells[m.id][mk] = {
        base: monthBase, carriedIn: monthCarriedIn, total: monthTotal, achieved: monthAchieved,
        attain: ratio(m.direction, monthTotal, monthAchieved), toCarry: monthToCarry,
        firstMonth: i === 0, hasWeeks: wkeys.length > 0, entry: openingEntry,
      };
      prevMonthToCarry = monthToCarry;
    });
  }
  return { monthCells, weekCells };
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
