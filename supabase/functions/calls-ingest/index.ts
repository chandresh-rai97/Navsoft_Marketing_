// Supabase Edge Function: calls-ingest
//
// Receives the cold-calling log from the team's Google Sheet (a Google Apps
// Script, not a signed-in user). Deploy with JWT verification OFF.
//
// Auth: header `x-cadence-key` must equal the secret CALLS_INGEST_KEY
// (constant-time comparison), otherwise 401.
//
// Protocol (POST, JSON body):
//   { "action": "start",  "total": 1234 }                      → { "run_id": "…" }
//   { "action": "append", "run_id": "…", "rows": [ … ≤500 ] }  → { "received": n }
//   { "action": "commit", "run_id": "…", "warnings": [ … ] }   → { "rows": n, "unknown_outcomes": [ … ] }
// Commit replaces call_log with the run's rows in one transaction, only if the
// number received equals `total`. More than 20 runs per hour are refused.
//
// Row fields read (anything else is ignored and never stored):
//   sheet_row, added_on, campaign, contact_name, company, call_date, caller,
//   outcome, next_follow_up, notes, and either contact_key or phone.
// A phone number is used only to build contact_key (a keyed hash) and is then
// dropped; phone numbers, emails and LinkedIn links are also removed from notes.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MAX_ROWS_PER_APPEND = 500;
const MAX_TOTAL = 200_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cadence-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const enc = new TextEncoder();

// Constant-time comparison (compares fixed-length SHA-256 digests).
async function sameSecret(given: string, expected: string) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Keyed hash of the phone digits: stable per contact, not reversible without the secret.
async function phoneKey(digits: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(digits)));
  return "p:" + [...sig.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- cleaning ----
const text = (v: unknown, max = 500) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

// Remove phone numbers, emails and LinkedIn links from free text.
function scrub(v: unknown) {
  const s = text(v, 2000);
  if (!s) return null;
  return s
    .replace(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/\S*/gi, "[link removed]")
    .replace(/(?:www\.)?linkedin\.com\/\S*/gi, "[link removed]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    // 10+ digits = a phone number (dates and times have fewer)
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[number removed]" : m));
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// A sheet date → 'YYYY-MM-DD' (India time). Accepts 2026-10-28, a full ISO
// timestamp (as Apps Script sends Date cells), or day-first 28/10/2026.
function day(v: unknown): string | null | undefined {
  const s = text(v, 40);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoDay(+m[1], +m[2], +m[3]) ?? undefined;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return undefined;
    return new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
  }
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return isoDay(y, +m[2], +m[1]) ?? undefined;
  }
  return undefined; // not understood
}

async function cleanRow(r: any, secret: string, warnings: string[]) {
  const where = `row ${r?.sheet_row ?? "?"}`;
  const dates: Record<string, string | null> = {};
  for (const f of ["added_on", "call_date", "next_follow_up"]) {
    const d = day(r?.[f]);
    if (d === undefined) warnings.push(`${where}: couldn't read ${f} "${String(r[f]).slice(0, 30)}"`);
    dates[f] = d ?? null;
  }
  let key = text(r?.contact_key, 120);
  if (!key) {
    const digits = String(r?.phone ?? "").replace(/\D/g, "");
    if (digits.length >= 6) key = await phoneKey(digits, secret);
    else {
      const name = (text(r?.contact_name) ?? "").toLowerCase(), co = (text(r?.company) ?? "").toLowerCase();
      key = name || co ? `n:${name}|${co}` : null;
    }
  }
  const row = Number.parseInt(r?.sheet_row, 10);
  return {
    sheet_row: Number.isFinite(row) ? row : null,
    added_on: dates.added_on,
    campaign: text(r?.campaign, 200),
    contact_name: text(r?.contact_name, 200),
    company: text(r?.company, 200),
    contact_key: key,
    call_date: dates.call_date,
    caller: text(r?.caller, 120),
    outcome: text(r?.outcome, 120),
    next_follow_up: dates.next_follow_up,
    notes: scrub(r?.notes),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const secret = Deno.env.get("CALLS_INGEST_KEY") ?? "";
  if (!secret) return json({ error: "CALLS_INGEST_KEY secret is not set" }, 500);
  if (!(await sameSecret(req.headers.get("x-cadence-key") ?? "", secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };

  try {
    switch (body?.action) {
      case "start": {
        const total = Number(body.total);
        if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL) {
          return json({ error: `total must be a whole number from 1 to ${MAX_TOTAL}` }, 400);
        }
        const r = await rpc("calls_start_run", { p_total: total });
        if (!r.ok) return json({ error: "More than 20 runs in the last hour; try again later" }, 429);
        return json({ run_id: r.run_id });
      }

      case "append": {
        const rows = body.rows;
        if (!body.run_id || !Array.isArray(rows)) return json({ error: "run_id and rows are required" }, 400);
        if (rows.length > MAX_ROWS_PER_APPEND) return json({ error: `At most ${MAX_ROWS_PER_APPEND} rows per append` }, 413);
        const warnings: string[] = [];
        const clean = [];
        for (const r of rows) clean.push(await cleanRow(r, secret, warnings));
        const r = await rpc("calls_append_rows", { p_run: body.run_id, p_rows: clean });
        if (!r.ok) {
          const status = r.reason === "unknown_run" ? 404 : 409;
          return json({ error: r.reason, ...r }, status);
        }
        return json({ received: r.received, warnings: warnings.slice(0, 50) });
      }

      case "commit": {
        if (!body.run_id) return json({ error: "run_id is required" }, 400);
        const warnings = Array.isArray(body.warnings) ? body.warnings.slice(0, 200).map((w: unknown) => String(w).slice(0, 300)) : null;
        const r = await rpc("calls_commit_run", { p_run: body.run_id, p_warnings: warnings });
        if (!r.ok) {
          const status = r.reason === "unknown_run" ? 404 : 409;
          return json({ error: r.reason, ...r }, status);
        }
        return json({ rows: r.rows, unknown_outcomes: r.unknown_outcomes ?? [] });
      }

      default:
        return json({ error: 'action must be "start", "append" or "commit"' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
