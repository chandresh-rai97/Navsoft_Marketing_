// Thin data-access layer over Supabase (PostgREST). All access is governed by
// the RLS policies defined in supabase/migrations/0001_init.sql.
import { supabase } from "./supabase.js";
import { nowIso } from "./format.js";
import { loadTabAccess } from "./tabAccess.js";

const TABLES = {
  users: "profiles",
  projects: "projects",
  objectives: "objectives",
  keyResults: "key_results",
  tasks: "tasks",
  blockers: "blockers",
  standups: "standup_entries",
  weeklyPriorities: "weekly_priorities",
  taskDependencies: "task_dependencies",
  projectMembers: "project_members",
  taskCollaborators: "task_collaborators",
  notifications: "notifications",
  eoMetrics: "eo_metrics",
  eoMonths: "eo_months",
  eoEntries: "eo_entries",
};

// Primary-key columns used to page through each table in a stable order.
const ORDER = {
  task_dependencies: ["task_id", "user_id"],
  project_members: ["project_id", "user_id"],
  task_collaborators: ["task_id", "user_id"],
};
const PAGE = 1000;

// Every row of one table the user may read. Supabase returns at most 1,000
// rows per request, so read page by page until the total is reached (or, if
// the total isn't known, until a page comes back empty).
async function fetchTable(table) {
  const rows = [];
  let total = null;
  for (let from = 0; total === null || rows.length < total; ) {
    let q = supabase.from(table).select("*", from === 0 ? { count: "exact" } : undefined);
    for (const col of ORDER[table] || ["id"]) q = q.order(col);
    const { data, error, count } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    if (from === 0 && Number.isFinite(count)) total = count;
    if (!data.length) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
}

// Load the whole team's working set in parallel. A table the user can't read
// comes back empty instead of breaking the load.
export async function loadAll() {
  const entries = Object.entries(TABLES);
  const [results, tabAccess] = await Promise.all([
    Promise.all(
      entries.map(([, table]) =>
        fetchTable(table).catch((e) => {
          console.error(`Failed loading ${table}:`, e?.message || e);
          return [];
        })
      )
    ),
    loadTabAccess().catch(() => null),
  ]);
  const db = {};
  entries.forEach(([key], i) => {
    db[key] = results[i];
  });
  db.tabAccess = tabAccess; // Campaigns / HubSpot Team Activity access (null = not available)
  return db;
}

export async function insertRow(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateRow(table, id, patch) {
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertRow(table, row, onConflict) {
  const { data, error } = await supabase
    .from(table)
    .upsert(row, onConflict ? { onConflict } : undefined)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// Fire-and-forget audit trail. Never blocks the primary write.
export async function writeAudit(entity_type, entity_id, action, old_value, new_value, changed_by_user_id) {
  try {
    await supabase.from("audit_log").insert({
      entity_type,
      entity_id,
      action,
      changed_by_user_id: changed_by_user_id || null,
      old_value: old_value ?? null,
      new_value: new_value ?? null,
      ts: nowIso(),
    });
  } catch (e) {
    // Auditing is best-effort; a viewer or missing perms shouldn't break the app.
    console.warn("audit failed:", e?.message);
  }
}

export async function runCarrySweep(today) {
  try {
    const { error } = await supabase.rpc("carry_forward_sweep", { p_today: today });
    if (error) console.warn("carry sweep:", error.message);
  } catch (e) {
    console.warn("carry sweep failed:", e?.message);
  }
}

export { TABLES };
