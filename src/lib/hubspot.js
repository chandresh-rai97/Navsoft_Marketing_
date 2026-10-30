// HubSpot Team Activity: data loading (read-only; the hubspot-sync Edge
// Function is the only writer) and the calculations behind the tab. Dates are
// 'YYYY-MM-DD' strings in India time.
import { supabase } from "./supabase.js";
import { todayIST, addDays } from "./instantly.js";

export { todayIST, addDays };
export const UNASSIGNED = "__unassigned__";
export const HUBSPOT_DEAL_URL = "https://app.hubspot.com/contacts/242083574/record/0-3/";
export const BACKFILL_FROM = "2025-03-01";
export const TYPES = ["calls", "emails", "meetings"];
const TYPE_OF = { call: "calls", email: "emails", meeting: "meetings" };

const istDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export const istDay = (iso) => istDayFmt.format(new Date(iso));

export const fmt = (n) => Number(n).toLocaleString("en-IN");
export const nice = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const niceY = (s) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const monthLabel = (k) =>
  new Date(k + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
export const daysBetween = (from, to) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
const ownerKey = (o) => o || UNASSIGNED;

// "Marketing Qualified Lead" → "MQL"; single words stay as they are.
export function stageShort(label) {
  const words = String(label).trim().split(/\s+/);
  return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join("") : label;
}
export function joinList(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// ---- date presets ----
export const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["all", "All time"],
];

export function rangeFor(preset, custom, firstDay, t = todayIST()) {
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
    case "all":
      return [firstDay && firstDay < t ? firstDay : t, t];
    case "custom":
      return [custom.from || t, custom.to || t];
    default:
      return [t.slice(0, 8) + "01", t];
  }
}

// ---- loading ----
async function fetchAll(table, columns, build = (q) => q) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(supabase.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function loadHubspotData() {
  const [people, settings, activity, done, open, deals, lastOk] = await Promise.all([
    fetchAll("hubspot_people", "owner_id,name,active", (q) => q.order("name")),
    supabase.from("hubspot_alert_settings").select("threshold_days,stages").eq("id", 1).maybeSingle(),
    fetchAll("hubspot_activity_daily", "day,owner_id,type,n", (q) => q.order("day").order("owner_id").order("type")),
    fetchAll("hubspot_tasks_done_daily", "day,owner_id,n", (q) => q.order("day").order("owner_id")),
    fetchAll("hubspot_tasks", "id,owner_id,due_at", (q) => q.neq("status", "COMPLETED").order("id")),
    fetchAll("hubspot_watch_deals", "id,name,stage,owner_id,last_contacted_at", (q) => q.order("id")),
    supabase.from("hubspot_sync_log").select("finished_at").eq("status", "success").order("finished_at", { ascending: false }).limit(1),
  ]);
  if (settings.error) throw settings.error;
  if (lastOk.error) throw lastOk.error;

  // Daily rows in one shape: { d, o, t, n } with t in calls/emails/meetings/tasks.
  const daily = [
    ...activity.map((r) => ({ d: r.day, o: ownerKey(r.owner_id), t: TYPE_OF[r.type], n: r.n })),
    ...done.map((r) => ({ d: r.day, o: ownerKey(r.owner_id), t: "tasks", n: r.n })),
  ];
  return {
    people: people.filter((p) => p.active),
    threshold: settings.data?.threshold_days ?? 10,
    stages: settings.data?.stages ?? [],
    daily,
    open: open.map((t) => ({ o: ownerKey(t.owner_id), due: t.due_at })),
    deals: deals.map((d) => ({ ...d, o: ownerKey(d.owner_id) })),
    lastUpdated: lastOk.data[0]?.finished_at || null,
  };
}

// Runs the hubspot-sync Edge Function as the signed-in user.
export async function runHubspotSync() {
  const { data, error } = await supabase.functions.invoke("hubspot-sync", { body: {} });
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

// Admin Settings writes (admin-only database functions).
export async function saveAlertSettings(threshold, stages) {
  const { error } = await supabase.rpc("hubspot_save_alert_settings", { p_threshold: threshold, p_stages: stages });
  if (error) throw error;
}
export async function savePeople(people) {
  const { error } = await supabase.rpc("hubspot_save_people", { p_people: people });
  if (error) throw error;
}

// ---- calculations ----

// People the tab knows about: active allowlist (alphabetical) then Unassigned.
export function personList(people) {
  return [...people.map((p) => [p.owner_id, p.name]).sort((a, b) => a[1].localeCompare(b[1])), [UNASSIGNED, "Unassigned"]];
}

export function rowsIn(daily, from, to, person) {
  return daily.filter((r) => r.d >= from && r.d <= to && (!person || r.o === person));
}

// Pending tasks as of now. Overdue = due time has passed; due today = due later
// today (IST); upcoming = after today (or no due date).
export function pendingByOwner(open, now = Date.now(), today = todayIST()) {
  const out = {};
  for (const t of open) {
    const p = (out[t.o] ||= { today: 0, overdue: 0, upcoming: 0, pending: 0 });
    p.pending++;
    const due = t.due ? Date.parse(t.due) : null;
    if (due !== null && due < now) p.overdue++;
    else if (due !== null && istDay(t.due) === today) p.today++;
    else p.upcoming++;
  }
  return out;
}

// Deals in the alert stages not contacted for `threshold`+ days (or never),
// longest-neglected first.
export function neglectedDeals(deals, threshold, today = todayIST()) {
  return deals
    .map((d) => {
      const last = d.last_contacted_at ? istDay(d.last_contacted_at) : null;
      return { ...d, last, days: last ? daysBetween(last, today) : null };
    })
    .filter((d) => d.days === null || d.days >= threshold)
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || String(a.name).localeCompare(String(b.name)));
}

// Chart buckets: per day, or per month when the range is longer than 62 days.
export function chartBuckets(rows, from, to, firstDay) {
  let f = from;
  if (firstDay && f < firstDay) f = firstDay;
  if (f > to) f = to;
  const monthly = daysBetween(f, to) + 1 > 62;
  const keys = [];
  if (monthly) {
    let m = f.slice(0, 7);
    while (m <= to.slice(0, 7) && keys.length < 240) {
      keys.push(m);
      const [y, mo] = m.split("-").map(Number);
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    }
  } else {
    for (let d = f; d <= to && keys.length < 400; d = addDays(d, 1)) keys.push(d);
  }
  const by = {};
  keys.forEach((k) => (by[k] = { calls: 0, emails: 0, meetings: 0 }));
  rows.forEach((r) => {
    const k = monthly ? r.d.slice(0, 7) : r.d;
    if (by[k] && r.t in by[k]) by[k][r.t] += r.n;
  });
  return { monthly, keys, by };
}
