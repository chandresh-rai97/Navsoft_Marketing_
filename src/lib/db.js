// Thin data-access layer over Supabase (PostgREST). All access is governed by
// the RLS policies defined in supabase/migrations/0001_init.sql.
import { supabase } from "./supabase.js";
import { nowIso } from "./format.js";

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
};

// Load the whole team's working set in parallel. Fine for a single-team MVP.
export async function loadAll() {
  const entries = Object.entries(TABLES);
  const results = await Promise.all(
    entries.map(([, table]) => supabase.from(table).select("*"))
  );
  const db = {};
  results.forEach((res, i) => {
    const [key] = entries[i];
    if (res.error) {
      console.error(`Failed loading ${TABLES[key]}:`, res.error.message);
      db[key] = [];
    } else {
      db[key] = res.data || [];
    }
  });
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
