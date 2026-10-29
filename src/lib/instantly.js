// Instantly.ai campaign analytics: data loading (read-only; the instantly-sync
// Edge Function is the only writer) and the pure calculations behind the
// Campaigns tab. All dates are 'YYYY-MM-DD' strings in India time.
import { supabase } from "./supabase.js";

export const TZ = "Asia/Kolkata";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const numFmt = new Intl.NumberFormat("en-US");
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const todayIST = () => dayFmt.format(new Date());

export function addDays(s, n) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const fmtNum = (v) => numFmt.format(v);
export const fmtRate = (v) => (v == null ? "—" : (v * 100).toFixed(1) + "%");
export function longDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function shortDay(s) {
  const [, m, d] = s.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
// "29 Oct 2026, 9:02 AM IST"
export function fmtUpdated(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return `${longDay(dayFmt.format(d))}, ${timeFmt.format(d).toUpperCase()} IST`;
}

// ---- who sees the tab: admin, viewer, or the Email Marketing project lead ----
export function canSeeCampaigns(me, projects) {
  if (!me) return false;
  if (me.role === "admin" || me.role === "viewer") return true;
  return projects.some((p) => (p.name || "").trim().toLowerCase() === "email marketing" && p.lead_user_id === me.id);
}

// ---- date presets ----
export const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["custom", "Custom"],
];

export function rangeFor(preset, start, end, t = todayIST()) {
  switch (preset) {
    case "today":
      return [t, t];
    case "yesterday": {
      const y = addDays(t, -1);
      return [y, y];
    }
    case "week": {
      const dow = new Date(t + "T00:00:00Z").getUTCDay(); // 0 = Sunday
      return [addDays(t, -((dow + 6) % 7)), t];
    }
    case "custom":
      return [start || null, end || t];
    default:
      return [t.slice(0, 8) + "01", t];
  }
}

export function rangeLabel(preset, from, to) {
  const names = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month" };
  if (names[preset]) return names[preset];
  return (from ? longDay(from) : "Start") + " to " + longDay(to);
}

// ---- regions ----
const ORDER = ["India", "SEA", "Europe", "US", "Middle East"];
export const regionRank = (r) => {
  const i = ORDER.indexOf(r);
  return i >= 0 ? i : r === "Unassigned" ? 99 : 50;
};
export const byRegion = (a, b) => regionRank(a) - regionRank(b) || a.localeCompare(b);
export const UNMAPPED = " (unmapped)";

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

export async function loadCampaignData() {
  const [campaigns, stats, lastOk] = await Promise.all([
    fetchAll("instantly_campaigns", "id,name,region,status,deleted_in_instantly", ["id"]),
    fetchAll(
      "instantly_daily_stats",
      "campaign_id,date,sent,new_leads,unique_opens,unique_clicks,replies,auto_replies,bounced,opportunities",
      ["date", "campaign_id"]
    ),
    supabase
      .from("instantly_sync_log")
      .select("finished_at")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1),
  ]);
  if (lastOk.error) throw lastOk.error;
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const daily = stats.map((r) => {
    const c = byId.get(r.campaign_id) || {};
    return {
      ...r,
      campaign: c.name || r.campaign_id,
      region: c.region || "Unassigned",
      deleted: !!c.deleted_in_instantly,
    };
  });
  return { campaigns, daily, lastUpdated: lastOk.data[0]?.finished_at || null };
}

// Runs the instantly-sync Edge Function as the signed-in user.
export async function runSync() {
  const { data, error } = await supabase.functions.invoke("instantly-sync", { body: {} });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data;
}

// ---- calculations (rates are per email sent) ----
const KEYS = ["sent", "new_leads", "unique_opens", "unique_clicks", "replies", "bounced"];

export function scoped(daily, from, to, region) {
  return daily.filter((r) => (!from || r.date >= from) && r.date <= to && (!region || r.region === region));
}

export function total(rows) {
  const t = {};
  KEYS.forEach((k) => (t[k] = 0));
  rows.forEach((r) => KEYS.forEach((k) => (t[k] += Number(r[k]) || 0)));
  return t;
}

export function rates(t) {
  const s = t.sent;
  return {
    open: s ? t.unique_opens / s : null,
    click: s ? t.unique_clicks / s : null,
    reply: s ? t.replies / s : null,
    bounce: s ? t.bounced / s : null,
  };
}

export function byKey(rows, key) {
  const g = new Map();
  rows.forEach((r) => {
    if (!g.has(r[key])) g.set(r[key], []);
    g.get(r[key]).push(r);
  });
  return Array.from(g, ([k, rs]) => ({
    key: k,
    campaign: rs[0].campaign,
    region: rs[0].region,
    deleted: rs[0].deleted,
    ...total(rs),
  }));
}

// Region pills: every region that has data, in the fixed order.
export function regionsInData(daily) {
  return Array.from(new Set(daily.map((r) => r.region))).sort(byRegion);
}

export function regionTable(rows) {
  const active = rows.filter((r) => r.sent > 0 || r.unique_opens > 0 || r.replies > 0 || r.bounced > 0);
  return byKey(active, "region")
    .sort((a, b) => byRegion(a.key, b.key))
    .map((g) => ({
      ...g,
      campaigns: new Set(active.filter((r) => r.region === g.key && r.sent > 0).map((r) => r.campaign_id)).size,
      ...rates(g),
    }));
}

export function topCampaigns(rows) {
  return byKey(rows, "campaign_id")
    .filter((c) => c.sent > 0)
    .sort((a, b) => b.unique_clicks - a.unique_clicks || b.replies - a.replies)
    .slice(0, 10)
    .map((c) => ({ ...c, ...rates(c) }));
}

// Weakness score: among campaigns with 200+ sends, rank on open rate (lower is
// worse), click rate (lower is worse) and bounce rate (higher is worse); the
// score is the average of the three percentile ranks, 0–100, higher is worse.
export function weakestCampaigns(rows) {
  const camps = byKey(rows, "campaign_id")
    .filter((c) => c.sent >= 200)
    .map((c) => ({ ...c, ...rates(c) }));
  const below = (k, v) => camps.filter((c) => c[k] < v).length / Math.max(camps.length - 1, 1);
  return camps
    .map((c) => ({
      ...c,
      score: Math.round((100 * (1 - below("open", c.open) + (1 - below("click", c.click)) + below("bounce", c.bounce))) / 3),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// One entry per day in the range (zero-filled), starting no earlier than the
// first day with any data.
export function trendDays(daily, from, to, region) {
  const minD = daily.length ? daily.reduce((m, r) => (r.date < m ? r.date : m), daily[0].date) : null;
  let f = from;
  if (minD && (!f || f < minD)) f = minD;
  if (!f) return [];
  const per = new Map();
  scoped(daily, f, to, region).forEach((r) => {
    const d = per.get(r.date) || { sent: 0, replies: 0 };
    d.sent += Number(r.sent) || 0;
    d.replies += Number(r.replies) || 0;
    per.set(r.date, d);
  });
  const days = [];
  for (let d = f; d <= to && days.length < 800; d = addDays(d, 1)) {
    days.push({ date: d, ...(per.get(d) || { sent: 0, replies: 0 }) });
  }
  return days;
}

// Campaigns whose first emails went out on `day`.
export function wentLive(daily, day, region) {
  const first = new Map();
  daily.forEach((r) => {
    if (Number(r.sent) > 0 && (!first.has(r.campaign_id) || r.date < first.get(r.campaign_id).date)) {
      first.set(r.campaign_id, r);
    }
  });
  return Array.from(first.values()).filter((r) => r.date === day && (!region || r.region === region));
}

export function activeOn(rows) {
  return byKey(rows, "campaign_id")
    .filter((c) => c.sent + c.unique_opens + c.unique_clicks + c.replies + c.bounced > 0)
    .sort((a, b) => b.sent - a.sent || b.unique_opens - a.unique_opens);
}
