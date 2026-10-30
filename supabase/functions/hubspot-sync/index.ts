// Supabase Edge Function: hubspot-sync
//
// Pulls calls, emails, meetings, tasks and watched deals from HubSpot into
// Supabase for the "HubSpot Team Activity" tab.
// - Scheduled: a pg_cron job calls it daily with the `x-cron-token` header.
// - On demand: the tab calls it with the signed-in user's token; only admins
//   and managers may run it.
// First run: backfills activities (and completed tasks) from 2025-03-01, month
// by month, continuing over several runs if it needs longer than one run may
// take. Every run: deletes and re-inserts the last 14 days of activities,
// fully refreshes open tasks, upserts tasks completed in the last 14 days and
// replaces the watched deals. Only owners on the hubspot_people allowlist (and
// records with no owner) are fetched and stored. Only ids, owners, dates and
// statuses are read: no email bodies, call notes, task text or contact details.
//
// Secrets: HUBSPOT_TOKEN (set by you). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with JWT verification OFF; this function checks callers itself.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const API = "https://api.hubapi.com/crm/v3/objects";
const USER_AGENT = "Cadence-hubspot-sync/1.0";
const PAGE = 200;
const SEARCH_LIMIT = 10_000; // HubSpot search returns at most 10,000 results per query
const WINDOW_DAYS = 14;
const TIME_BUDGET_MS = 110_000; // stop the backfill early and continue next run
const MIN_GAP_MS = 220; // ~4.5 search requests per second
const DAY = 86_400_000;
const FAR_FUTURE_DAYS = 400; // the recent window has no real end (future meetings)

const ACTIVITY_TYPES = [
  { object: "calls", type: "call", props: ["hs_timestamp", "hubspot_owner_id", "hs_call_disposition"] },
  { object: "emails", type: "email", props: ["hs_timestamp", "hubspot_owner_id", "hs_email_direction"] },
  { object: "meetings", type: "meeting", props: ["hs_timestamp", "hubspot_owner_id"] },
] as const;
const TASK_PROPS = ["hs_timestamp", "hubspot_owner_id", "hs_task_type", "hs_task_status", "hs_task_completion_date"];
const DEAL_PROPS = ["dealname", "dealstage", "pipeline", "hubspot_owner_id", "notes_last_contacted"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

class MissingScopeError extends Error {
  constructor(public scopes: string[]) {
    super(
      `The HubSpot service key is missing the scope ${scopes.map((s) => `"${s}"`).join(" or ")}. ` +
        "Add it to the key in HubSpot and run the sync again.",
    );
  }
}

// ---- dates: India time (UTC+5:30, no daylight saving) ----
const IST = "+05:30";
const istStart = (day: string) => Date.parse(`${day}T00:00:00${IST}`);
function istDay(ms: number) {
  return new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextMonth(day: string) {
  const [y, m] = day.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  const ms = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ---- HubSpot search with pacing, backoff and scope detection ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

async function search(object: string, body: Record<string, unknown>) {
  const token = Deno.env.get("HUBSPOT_TOKEN");
  if (!token) throw new Error("HUBSPOT_TOKEN secret is not set");
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(`${API}/${object}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return await res.json();

    const text = await res.text();
    let err: any = null;
    try {
      err = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (res.status === 403 && err?.category === "MISSING_SCOPES") {
      const scopes = new Set<string>();
      for (const e of err.errors ?? []) {
        for (const s of e?.context?.requiredGranularScopes ?? []) scopes.add(s);
        for (const s of e?.context?.requiredScopes ?? []) scopes.add(s);
      }
      throw new MissingScopeError(scopes.size ? [...scopes] : ["(HubSpot did not name it)"]);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    throw new Error(`HubSpot ${object} search returned ${res.status}: ${(err?.message ?? text).slice(0, 300)}`);
  }
}

// Filter groups that keep only allowlisted owners or records with no owner.
function ownerGroups(owners: string[], filters: Record<string, unknown>[]) {
  const groups = [{ filters: [{ propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" }, ...filters] }];
  if (owners.length) {
    groups.unshift({ filters: [{ propertyName: "hubspot_owner_id", operator: "IN", values: owners }, ...filters] });
  }
  return groups;
}

// Split a time window into IST days (or hours, for a single day).
function splitWindow(start: number, end: number): [number, number][] {
  const step = end - start > DAY ? DAY : 3_600_000;
  if (end - start <= 3_600_000) return [];
  const parts: [number, number][] = [];
  for (let s = start; s < end; s += step) parts.push([s, Math.min(s + step, end)]);
  return parts;
}

// Every record of `object` whose `dateProp` is in [start, end), for allowed owners.
async function fetchWindow(
  object: string,
  props: readonly string[],
  dateProp: string,
  start: number,
  end: number,
  owners: string[],
  extra: Record<string, unknown>[] = [],
): Promise<any[]> {
  const filters = [
    { propertyName: dateProp, operator: "GTE", value: String(start) },
    { propertyName: dateProp, operator: "LT", value: String(end) },
    ...extra,
  ];
  const base = {
    filterGroups: ownerGroups(owners, filters),
    properties: props,
    sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
    limit: PAGE,
  };
  const first = await search(object, base);
  if ((first.total ?? 0) >= SEARCH_LIMIT) {
    const parts = splitWindow(start, end);
    if (!parts.length) throw new Error(`More than ${SEARCH_LIMIT} ${object} in one hour; cannot split further`);
    const out: any[] = [];
    for (const [s, e] of parts) out.push(...(await fetchWindow(object, props, dateProp, s, e, owners, extra)));
    return out;
  }
  const out: any[] = [...(first.results ?? [])];
  let after = first.paging?.next?.after;
  while (after) {
    const page = await search(object, { ...base, after });
    out.push(...(page.results ?? []));
    after = page.paging?.next?.after;
  }
  return out;
}

// ---- row builders (only the fields we keep) ----
function allowedOwner(p: any, allow: Set<string>) {
  const o = p?.hubspot_owner_id ? String(p.hubspot_owner_id) : "";
  return !o || allow.has(o) ? o || null : undefined;
}

function activityRows(records: any[], type: string, allow: Set<string>) {
  const rows = [];
  for (const r of records) {
    const p = r.properties ?? {};
    const owner = allowedOwner(p, allow);
    const occurred = toIso(p.hs_timestamp);
    if (owner === undefined || !occurred) continue;
    rows.push({
      id: String(r.id),
      type,
      owner_id: owner,
      occurred_at: occurred,
      call_outcome: type === "call" ? p.hs_call_disposition ?? null : null,
      email_direction: type === "email" ? p.hs_email_direction ?? null : null,
    });
  }
  return rows;
}

function taskRows(records: any[], allow: Set<string>) {
  const rows = [];
  for (const r of records) {
    const p = r.properties ?? {};
    const owner = allowedOwner(p, allow);
    if (owner === undefined) continue;
    rows.push({
      id: String(r.id),
      owner_id: owner,
      task_type: p.hs_task_type ?? null,
      status: p.hs_task_status ?? null,
      due_at: toIso(p.hs_timestamp),
      completed_at: toIso(p.hs_task_completion_date),
    });
  }
  return rows;
}

function dealRows(records: any[], allow: Set<string>) {
  const rows = [];
  for (const r of records) {
    const p = r.properties ?? {};
    const owner = allowedOwner(p, allow);
    if (owner === undefined) continue;
    rows.push({
      id: String(r.id),
      name: p.dealname ?? null,
      stage: p.dealstage ?? null,
      pipeline: p.pipeline ?? null,
      owner_id: owner,
      last_contacted_at: toIso(p.notes_last_contacted),
    });
  }
  return rows;
}

// ---- main ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const startedAt = Date.now();

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };

  // ---- who is calling? ----
  let triggeredBy: string;
  const cronToken = req.headers.get("x-cron-token");
  if (cronToken) {
    const { data: ok, error } = await db.rpc("hubspot_check_cron_token", { p_token: cronToken });
    if (error || ok !== true) return json({ error: "Invalid schedule token" }, 401);
    triggeredBy = "schedule";
  } else {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Not signed in" }, 401);
    const { data: canView, error: roleErr } = await db.rpc("hubspot_user_can_view", { p_uid: userData.user.id });
    if (roleErr || canView !== true) return json({ error: "Only admins and managers can refresh HubSpot data" }, 403);
    triggeredBy = userData.user.id;
  }

  // ---- one run at a time, and not within 10 minutes of the last success ----
  const { data: begin, error: beginErr } = await db.rpc("hubspot_sync_begin", { p_triggered_by: triggeredBy });
  if (beginErr) return json({ error: beginErr.message }, 500);
  if (!begin.started) {
    return json({ status: "skipped", reason: begin.reason, last_finished_at: begin.last_finished_at ?? null });
  }
  const logId: number = begin.log_id;

  try {
    // Allowlist and alert stages, read fresh every run.
    const { data: people, error: pErr } = await db.from("hubspot_people").select("owner_id").eq("active", true);
    if (pErr) throw new Error("Reading people: " + pErr.message);
    const owners = people.map((p: any) => String(p.owner_id));
    const allow = new Set(owners);
    const { data: settings, error: sErr } = await db.from("hubspot_alert_settings").select("stages").eq("id", 1).single();
    if (sErr) throw new Error("Reading alert settings: " + sErr.message);
    const stageIds: string[] = (settings.stages ?? []).map((s: any) => String(s.id)).filter(Boolean);

    await rpc("hubspot_purge_unlisted");

    const today = istDay(Date.now());
    const windowStartDay = addDays(today, -(WINDOW_DAYS - 1));
    const windowStart = istStart(windowStartDay);
    const farFuture = Date.now() + FAR_FUTURE_DAYS * DAY;

    // 1. First run: backfill everything before the recent window, a month at a time.
    if (begin.first_run) {
      let day: string = begin.backfill_from;
      while (day < windowStartDay) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
          await rpc("hubspot_sync_finish", {
            p_log_id: logId,
            p_status: "partial",
            p_error: `Backfill reached ${addDays(day, -1)}; run again to continue`,
          });
          return json({ status: "partial", backfilled_to: addDays(day, -1) });
        }
        const chunkEndDay = nextMonth(day) < windowStartDay ? nextMonth(day) : windowStartDay;
        const s = istStart(day), e = istStart(chunkEndDay);
        for (const t of ACTIVITY_TYPES) {
          const recs = await fetchWindow(t.object, t.props, "hs_timestamp", s, e, owners);
          await rpc("hubspot_upsert_activities", { p_rows: activityRows(recs, t.type, allow) });
        }
        const done = await fetchWindow("tasks", TASK_PROPS, "hs_task_completion_date", s, e, owners, [
          { propertyName: "hs_task_status", operator: "EQ", value: "COMPLETED" },
        ]);
        await rpc("hubspot_upsert_tasks", { p_rows: taskRows(done, allow) });
        await rpc("hubspot_sync_progress", { p_log_id: logId, p_backfilled_to: addDays(chunkEndDay, -1) });
        day = chunkEndDay;
      }
    }

    // 2. Last 14 days of activities: delete and re-insert.
    const recent: any[] = [];
    for (const t of ACTIVITY_TYPES) {
      const recs = await fetchWindow(t.object, t.props, "hs_timestamp", windowStart, farFuture, owners);
      recent.push(...activityRows(recs, t.type, allow));
    }
    await rpc("hubspot_replace_activities", { p_from: new Date(windowStart).toISOString(), p_rows: recent });

    // 3. Open tasks: full refresh (windowed on creation date only so very large
    //    sets can be split under the search limit).
    const open = await fetchWindow("tasks", TASK_PROPS, "hs_createdate", Date.parse("2010-01-01T00:00:00Z"), Date.now() + DAY, owners, [
      { propertyName: "hs_task_status", operator: "NEQ", value: "COMPLETED" },
    ]);
    await rpc("hubspot_replace_open_tasks", { p_rows: taskRows(open, allow) });

    // 4. Tasks completed in the last 14 days: upsert.
    const done = await fetchWindow("tasks", TASK_PROPS, "hs_task_completion_date", windowStart, Date.now() + DAY, owners, [
      { propertyName: "hs_task_status", operator: "EQ", value: "COMPLETED" },
    ]);
    await rpc("hubspot_upsert_tasks", { p_rows: taskRows(done, allow) });

    // 5. Deals currently in an alert stage: replace.
    const deals = stageIds.length
      ? await fetchWindow("deals", DEAL_PROPS, "createdate", Date.parse("2000-01-01T00:00:00Z"), Date.now() + DAY, owners, [
        { propertyName: "dealstage", operator: "IN", values: stageIds },
      ])
      : [];
    await rpc("hubspot_replace_deals", { p_rows: dealRows(deals, allow) });

    await rpc("hubspot_sync_finish", { p_log_id: logId, p_status: "success" });
    return json({
      status: "success",
      first_run: begin.first_run,
      recent_activities: recent.length,
      open_tasks: open.length,
      completed_tasks_14d: done.length,
      watched_deals: deals.length,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.rpc("hubspot_sync_finish", { p_log_id: logId, p_status: "error", p_error: message.slice(0, 1000) });
    if (e instanceof MissingScopeError) {
      return json({ status: "error", missing_scope: e.scopes, error: message }, 400);
    }
    return json({ status: "error", error: message }, 500);
  }
});
