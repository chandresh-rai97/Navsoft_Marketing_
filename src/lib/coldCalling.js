// Cold Calling Activity: data loading (read-only; the calls-ingest Edge
// Function is the only writer) and the calculations behind the tab. Dates are
// 'YYYY-MM-DD' strings; "today" is India time.
import { supabase } from "./supabase.js";
import { todayIST, addDays } from "./instantly.js";

export { todayIST, addDays };

// call_outcomes.category → internal key
export const CATEGORY_KEY = {
  Positive: "pos",
  "Follow-up": "fu",
  Negative: "neg",
  "Not connected": "nc",
  "Bad number": "bad",
};
export const CATEGORIES = Object.keys(CATEGORY_KEY);
export const CAT_LABEL = { pos: "Positive", fu: "Follow-up", neg: "Negative", nc: "Not connected", bad: "Bad number", other: "Connected (other)" };
export const CAT_COLOR = {
  pos: "var(--cc-pos)",
  fu: "var(--cc-fu)",
  neg: "var(--cc-neg)",
  nc: "var(--cc-nc)",
  bad: "var(--cc-bad)",
  other: "var(--cc-other)",
};
export const CAT_ORDER = ["pos", "fu", "other", "neg", "nc", "bad"];
const MEETING = "connected - meeting booked";

export const fmt = (n) => Number(n).toLocaleString("en-IN");
export const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "—");
export const nice = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const niceY = (s) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// ---- campaign names ----
// Product first (keywords from campaign_products), region last, industry in
// between; a trailing launch date is ignored; no known product = an event.
const REGIONS = [
  ["middle east", "Middle East"], ["mena", "Middle East"], ["me", "Middle East"], ["uae", "Middle East"],
  ["ksa", "Middle East"], ["saudi", "Middle East"], ["gcc", "Middle East"], ["sea", "SEA"], ["india", "India"],
  ["ind", "India"], ["europe", "Europe"], ["eu", "Europe"], ["uk", "Europe"], ["usa", "US"], ["us", "US"],
];
export const REGION_ORDER = ["India", "SEA", "Europe", "US", "Middle East"];
export const regionSort = (a, b) =>
  (REGION_ORDER.indexOf(a) + 1 || 90) - (REGION_ORDER.indexOf(b) + 1 || 90) || a.localeCompare(b);

export function makeCampaignParser(products) {
  // longest keyword first, so "data transformation" wins over shorter ones
  const list = products
    .map((p) => [String(p.keyword).toLowerCase().trim(), p.product])
    .filter(([k]) => k)
    .sort((a, b) => b[0].length - a[0].length);
  const cache = {};
  return function parseCampaign(name) {
    const raw = (name || "").trim();
    if (!raw) return { product: "Not set", industry: "Not set", region: "Not set" };
    if (cache[raw]) return cache[raw];
    let s = " " + raw.replace(/[_()[\]|,\-–]+/g, " ") + " ";
    s = s
      .replace(/\s\d{1,2}(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*'?\s*\d{2,4}(?=\s)/gi, " ")
      .replace(/\s\d{1,2}[/.]\d{1,2}[/.]\d{2,4}(?=\s)/g, " ")
      .replace(/\s\d{4}[/.]\d{1,2}[/.]\d{1,2}(?=\s)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let low = s.toLowerCase();
    let region = "Not set";
    for (const [k, v] of REGIONS) {
      const re = new RegExp("(^|\\s)" + k.replace(" ", "\\s") + "$", "i");
      if (re.test(low)) {
        region = v;
        s = s.slice(0, s.length - k.length).trim();
        low = s.toLowerCase();
        break;
      }
    }
    if (region === "Not set") {
      for (const [k, v] of REGIONS) {
        if (new RegExp("(^|\\s)" + k.replace(" ", "\\s") + "(\\s|$)", "i").test(low)) {
          region = v;
          break;
        }
      }
    }
    let product = null;
    let industry = "";
    for (const [k, v] of list) {
      if (low === k || low.startsWith(k + " ")) {
        product = v;
        industry = s.slice(k.length).trim();
        break;
      }
    }
    if (!product) {
      product = "Event";
      industry = "Event";
    }
    return (cache[raw] = { product, industry: industry || "Not specified", region });
  };
}

// ---- loading ----
async function fetchAll(table, columns, order) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    order.forEach((c) => (q = q.order(c)));
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function loadColdCallingData() {
  const [rows, outcomes, products, lastOk] = await Promise.all([
    fetchAll("call_log", "id,sheet_row,added_on,campaign,contact_name,company,contact_key,call_date,caller,outcome,next_follow_up,notes", ["sheet_row", "id"]),
    fetchAll("call_outcomes", "outcome,category", ["outcome"]),
    fetchAll("campaign_products", "keyword,product", ["keyword"]),
    supabase.from("call_sync_log").select("finished_at").eq("status", "success").order("finished_at", { ascending: false }).limit(1),
  ]);
  if (lastOk.error) throw lastOk.error;
  const cat = Object.fromEntries(outcomes.map((o) => [o.outcome, CATEGORY_KEY[o.category]]));
  const parse = makeCampaignParser(products);
  const calls = rows.map((r) => {
    const outcome = r.outcome || "";
    const c = cat[outcome] || (/^connected\b/i.test(outcome) ? "other" : "nc");
    return {
      added: r.added_on,
      date: r.call_date,
      caller: r.caller || "",
      contact: r.contact_name || "",
      company: r.company || "",
      campaign: r.campaign || "",
      outcome,
      fu: r.next_follow_up,
      notes: r.notes || "",
      key: r.contact_key || `${r.contact_name || ""}|${r.company || ""}`.toLowerCase(),
      cat: c,
      conn: ["pos", "fu", "neg", "other"].includes(c),
      meeting: outcome.trim().toLowerCase() === MEETING,
      meta: parse(r.campaign),
    };
  });
  const unknown = [...new Set(rows.map((r) => r.outcome).filter((o) => o && o.trim() && !(o in cat)))].sort();
  return { calls, unknown, outcomes, products, lastReceived: lastOk.data[0]?.finished_at || null };
}

// Admin Settings writes (admin-only database functions).
export async function saveOutcomes(rows) {
  const { error } = await supabase.rpc("calls_save_outcomes", { p_rows: rows });
  if (error) throw error;
}
export async function saveProducts(rows) {
  const { error } = await supabase.rpc("calls_save_products", { p_rows: rows });
  if (error) throw error;
}

// ---- calculations ----
export function rangeFor(preset, custom, calls, t = todayIST()) {
  const min = calls.reduce((m, r) => (r.date && r.date < m ? r.date : m), t);
  switch (preset) {
    case "today":
      return [t, t];
    case "yesterday": {
      const y = addDays(t, -1);
      return [y, y];
    }
    case "week": {
      const dow = (new Date(t + "T00:00:00Z").getUTCDay() + 6) % 7;
      return [addDays(t, -dow), t];
    }
    case "month":
      return [t.slice(0, 8) + "01", t];
    case "custom":
      return [custom.from || min, custom.to || t];
    default:
      return [min, t];
  }
}

// One row of the caller summary / team total.
export function summaryRow(rs) {
  const c = rs.filter((r) => r.conn).length;
  const k = (x) => rs.filter((r) => r.cat === x).length;
  return {
    calls: rs.length,
    leads: new Set(rs.map((r) => r.key)).size,
    connected: c,
    rate: pct(c, rs.length),
    pos: k("pos"),
    meetings: rs.filter((r) => r.meeting).length,
    fu: k("fu"),
    neg: k("neg"),
    nc: k("nc"),
    bad: k("bad"),
  };
}

// Each contact's latest call with a next follow-up date (not negative, not a
// bad number, not a booked meeting), with its status relative to today.
export function followUps(scoped, today = todayIST()) {
  const latest = {};
  scoped.filter((r) => r.date).forEach((r) => {
    if (!latest[r.key] || r.date >= latest[r.key].date) latest[r.key] = r;
  });
  return Object.values(latest)
    .filter((r) => r.fu && r.cat !== "neg" && r.cat !== "bad" && !r.meeting)
    .map((r) => ({ ...r, status: r.fu < today ? "overdue" : r.fu === today ? "today" : "upcoming" }))
    .sort((a, b) => (a.fu < b.fu ? -1 : a.fu > b.fu ? 1 : 0));
}

// Campaigns: contacts given, dialled, pending, reached, positive (per contact).
export function campaignRows(scoped) {
  const leads = {};
  scoped.forEach((r) => {
    const k = r.campaign + "§" + r.key;
    const L = leads[k] || (leads[k] = { c: r.campaign, meta: r.meta, dialled: false, reached: false, pos: false });
    if (r.date) {
      L.dialled = true;
      if (r.conn) L.reached = true;
      if (r.cat === "pos") L.pos = true;
    }
  });
  const g = {};
  Object.values(leads).forEach((L) => (g[L.c] = g[L.c] || []).push(L));
  return Object.keys(g)
    .sort()
    .map((c) => {
      const ls = g[c];
      const d = ls.filter((L) => L.dialled).length;
      return { campaign: c, meta: ls[0].meta, given: ls.length, dialled: d, pending: ls.length - d,
        reached: ls.filter((L) => L.reached).length, pos: ls.filter((L) => L.pos).length };
    });
}

// Lead batches by "Data added on" (a contact counts once, under its earliest date).
export function batchRows(scoped) {
  const leads = {};
  scoped.forEach((r) => {
    const L = leads[r.key] || (leads[r.key] = { added: r.added, dialled: false, reached: false, pos: false, bad: false });
    if (r.added && (!L.added || r.added < L.added)) L.added = r.added;
    if (r.date) {
      L.dialled = true;
      if (r.conn) L.reached = true;
      if (r.cat === "pos") L.pos = true;
      if (r.cat === "bad") L.bad = true;
    }
  });
  const groups = {};
  Object.values(leads).forEach((L) => (groups[L.added || "Unknown"] = groups[L.added || "Unknown"] || []).push(L));
  const tot = { key: "All batches", given: 0, dialled: 0, pending: 0, reached: 0, pos: 0, bad: 0 };
  const rows = Object.keys(groups)
    .sort()
    .reverse()
    .map((k) => {
      const g = groups[k];
      const row = { key: k, given: g.length, dialled: g.filter((L) => L.dialled).length, reached: g.filter((L) => L.reached).length,
        pos: g.filter((L) => L.pos).length, bad: g.filter((L) => L.bad).length };
      row.pending = row.given - row.dialled;
      ["given", "dialled", "pending", "reached", "pos", "bad"].forEach((f) => (tot[f] += row[f]));
      return row;
    });
  return { rows, tot };
}

export function chartDays(calls, from, to) {
  const days = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const by = {};
  days.forEach((d) => {
    by[d] = {};
    CAT_ORDER.forEach((c) => (by[d][c] = 0));
  });
  calls.forEach((r) => {
    if (by[r.date]) by[r.date][r.cat]++;
  });
  return { days, by };
}
