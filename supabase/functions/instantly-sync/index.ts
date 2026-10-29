// Supabase Edge Function: instantly-sync
//
// Pulls Instantly.ai campaigns and daily campaign analytics into Supabase.
// - Scheduled: a pg_cron job calls it daily with the `x-cron-token` header.
// - On demand: the Campaigns tab calls it with the signed-in user's token; only
//   admins, viewers and the Email Marketing project lead may run it.
// Each run re-fetches the last 7 days (IST) so late opens/replies are picked up;
// the very first successful run backfills from 2026-09-01.
//
// Secrets: INSTANTLY_API_KEY (set by you). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with JWT verification OFF; this function checks callers itself.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const API = "https://api.instantly.ai/api/v2";
const USER_AGENT = "Cadence-instantly-sync/1.0";
const BACKFILL_FROM = "2026-09-01";
const WINDOW_DAYS = 7;
const CONCURRENCY = 4;

const STATUS: Record<string, string> = {
  "0": "Draft",
  "1": "Active",
  "2": "Paused",
  "3": "Completed",
  "4": "Running subsequences",
  "-1": "Accounts unhealthy",
  "-2": "Bounce protect",
  "-99": "Suspended",
};

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

// ---- dates (YYYY-MM-DD, India time) ----
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function addDays(s: string, n: number): string {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---- Instantly API ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function instantly(path: string, params: Record<string, string> = {}) {
  const key = Deno.env.get("INSTANTLY_API_KEY");
  if (!key) throw new Error("INSTANTLY_API_KEY secret is not set");
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return await res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) {
      const text = (await res.text()).slice(0, 300);
      throw new Error(`Instantly ${path} returned ${res.status}: ${text}`);
    }
    await sleep(1000 * 2 ** attempt);
  }
}

// Instantly returns either a bare array or an object wrapping one.
function asList(body: any): any[] {
  if (Array.isArray(body)) return body;
  return body?.items ?? body?.result ?? body?.data ?? [];
}

async function listCampaigns(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const params: Record<string, string> = { limit: "100" };
    if (cursor) params.starting_after = cursor;
    const body = await instantly("/campaigns", params);
    all.push(...asList(body));
    cursor = body?.next_starting_after || undefined;
  } while (cursor);
  return all;
}

// Run `fn` over `items` with at most CONCURRENCY calls in flight.
async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const n = (v: unknown) => Number(v) || 0;

// ---- main ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ---- who is calling? ----
  let triggeredBy: string;
  const cronToken = req.headers.get("x-cron-token");
  if (cronToken) {
    const { data: ok, error } = await admin.rpc("instantly_check_cron_token", { p_token: cronToken });
    if (error || ok !== true) return json({ error: "Invalid schedule token" }, 401);
    triggeredBy = "schedule";
  } else {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Not signed in" }, 401);
    // Same rule as the RLS policies on the Campaigns tables.
    const { data: canView, error: roleErr } = await admin.rpc("instantly_user_can_view", {
      p_uid: userData.user.id,
    });
    if (roleErr || canView !== true) {
      return json({ error: "Only admins, viewers and the Email Marketing lead can refresh campaigns" }, 403);
    }
    triggeredBy = userData.user.id;
  }

  // ---- one run at a time, and not within 10 minutes of the last one ----
  const { data: begin, error: beginErr } = await admin.rpc("instantly_sync_begin", {
    p_triggered_by: triggeredBy,
  });
  if (beginErr) return json({ error: beginErr.message }, 500);
  if (!begin.started) {
    return json({ status: "skipped", reason: begin.reason, last_finished_at: begin.last_finished_at ?? null });
  }
  const logId: number = begin.log_id;

  try {
    const to = todayIST();
    const from = begin.first_run ? BACKFILL_FROM : addDays(to, -(WINDOW_DAYS - 1));
    const now = new Date().toISOString();

    // 1. Campaigns (all of them, every run).
    const campaigns = await listCampaigns();
    if (campaigns.length) {
      const { error } = await admin.from("instantly_campaigns").upsert(
        campaigns.map((c) => ({
          id: c.id,
          name: c.name ?? "",
          status: STATUS[String(c.status)] ?? String(c.status ?? ""),
          created_at: c.timestamp_created ?? null,
          deleted_in_instantly: false,
          last_seen_at: now,
        })),
        { onConflict: "id" },
      );
      if (error) throw new Error("Saving campaigns: " + error.message);
      // An empty list is more likely an API hiccup than every campaign being
      // deleted, so only flag missing campaigns when the list came back.
      const { error: missErr } = await admin.rpc("instantly_mark_missing", {
        p_seen: campaigns.map((c) => c.id),
      });
      if (missErr) throw new Error("Flagging deleted campaigns: " + missErr.message);
    }
    const { error: regErr } = await admin.rpc("instantly_apply_regions");
    if (regErr) throw new Error("Applying regions: " + regErr.message);

    const known = new Set(campaigns.map((c) => c.id));
    const rows = new Map<string, Record<string, unknown>>();
    const rowFor = (campaignId: string, date: string) => {
      const key = campaignId + "|" + date;
      let r = rows.get(key);
      if (!r) {
        r = {
          campaign_id: campaignId, date,
          sent: 0, new_leads: 0, unique_opens: 0, unique_clicks: 0,
          replies: 0, auto_replies: 0, bounced: 0, opportunities: 0,
        };
        rows.set(key, r);
      }
      return r;
    };

    // 2. Daily analytics, per campaign.
    await pool(campaigns, async (c) => {
      const body = await instantly("/campaigns/analytics/daily", {
        campaign_id: c.id,
        start_date: from,
        end_date: to,
      });
      for (const d of asList(body)) {
        if (!d?.date || d.date < from || d.date > to) continue;
        Object.assign(rowFor(c.id, d.date), {
          sent: n(d.sent),
          new_leads: n(d.new_leads_contacted),
          unique_opens: n(d.unique_opened),
          unique_clicks: n(d.unique_clicks),
          replies: n(d.unique_replies),
          auto_replies: n(d.unique_replies_automatic),
          opportunities: n(d.unique_opportunities),
        });
      }
    });

    // 3. Bounces per day (the daily endpoint doesn't report them): one call
    //    per day covering every campaign, with start_date = end_date.
    await pool(daysBetween(from, to), async (day) => {
      const body = await instantly("/campaigns/analytics", { start_date: day, end_date: day });
      for (const a of asList(body)) {
        if (!known.has(a?.campaign_id) || !n(a.bounced_count)) continue;
        rowFor(a.campaign_id, day).bounced = n(a.bounced_count);
      }
    });

    // 4. Upsert (never delete).
    const all = [...rows.values()];
    for (let i = 0; i < all.length; i += 500) {
      const { error } = await admin
        .from("instantly_daily_stats")
        .upsert(all.slice(i, i + 500), { onConflict: "campaign_id,date" });
      if (error) throw new Error("Saving daily stats: " + error.message);
    }

    await admin.rpc("instantly_sync_finish", { p_log_id: logId, p_status: "success" });
    return json({
      status: "success",
      from,
      to,
      campaigns: campaigns.length,
      rows: all.length,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.rpc("instantly_sync_finish", { p_log_id: logId, p_status: "error", p_error: message.slice(0, 1000) });
    return json({ status: "error", error: message }, 500);
  }
});
