import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { supabase } from "../lib/supabase.js";
import {
  loadAll,
  insertRow,
  updateRow,
  upsertRow,
  deleteRow,
  writeAudit,
  runCarrySweep,
} from "../lib/db.js";
import { todayStr, shiftStr, nowIso, isoWeek } from "../lib/format.js";
import {
  OPEN_STATUSES,
  MOVE_REASON_AFTER,
  krProgress,
  taskDone,
  onTime,
  isOverdue as isOverdueBase,
} from "../lib/logic.js";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const EMPTY_DB = {
  users: [],
  projects: [],
  objectives: [],
  keyResults: [],
  tasks: [],
  blockers: [],
  standups: [],
  weeklyPriorities: [],
  taskDependencies: [],
};

export function AppDataProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [db, setDb] = useState(EMPTY_DB);
  const [loadingData, setLoadingData] = useState(false);

  // ---- auth session lifecycle ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const next = await loadAll();
    setDb(next);
    return next;
  }, []);

  // ---- load data whenever we have a session ----
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!session) {
        setDb(EMPTY_DB);
        return;
      }
      setLoadingData(true);
      await runCarrySweep(todayStr()); // roll unfinished work forward (once/day)
      const next = await loadAll();
      if (!cancelled) {
        setDb(next);
        setLoadingData(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const me = useMemo(
    () => (session ? db.users.find((u) => u.id === session.user.id) || null : null),
    [session, db.users]
  );

  // ---- auth actions ----
  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name?.trim() || "" } },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setDb(EMPTY_DB);
  }, []);

  // ---- lookups ----
  const U = useCallback((id) => db.users.find((u) => u.id === id), [db.users]);
  const P = useCallback((id) => db.projects.find((p) => p.id === id), [db.projects]);
  const KR = useCallback((id) => db.keyResults.find((k) => k.id === id), [db.keyResults]);
  const OBJ = useCallback((id) => db.objectives.find((o) => o.id === id), [db.objectives]);
  const uname = useCallback((id) => U(id)?.name || "—", [U]);
  const pname = useCallback((id) => P(id)?.name || "—", [P]);
  const activeUsers = useCallback(() => db.users.filter((u) => u.active), [db.users]);
  const activeProjects = useCallback(
    () => db.projects.filter((p) => p.status === "active"),
    [db.projects]
  );
  const krTasks = useCallback(
    (krId) => db.tasks.filter((t) => t.key_result_id === krId && t.status !== "cancelled"),
    [db.tasks]
  );

  // ---- task dependency people (many users per task) ----
  const depsByTask = useMemo(() => {
    const m = {};
    (db.taskDependencies || []).forEach((d) => {
      (m[d.task_id] = m[d.task_id] || []).push(d.user_id);
    });
    return m;
  }, [db.taskDependencies]);
  const taskDepUserIds = useCallback((taskId) => depsByTask[taskId] || [], [depsByTask]);

  // ---- role helpers ----
  const isAdmin = () => me?.role === "admin";
  const isManager = () => me?.role === "admin" || me?.role === "manager";
  const isViewer = () => me?.role === "viewer";
  const seesAll = () => ["admin", "manager", "viewer"].includes(me?.role);
  const canEditTask = useCallback(
    (t) => {
      if (!me) return false;
      if (me.role === "admin" || me.role === "manager") return true;
      return t.assignee_user_id === me.id && me.role !== "viewer";
    },
    [me]
  );

  const audit = useCallback(
    (entity, id, action, oldV, newV) =>
      writeAudit(entity, id, action, oldV, newV, me?.id),
    [me]
  );

  // =========================================================================
  // TASK MUTATIONS
  // =========================================================================

  // Mark a task fully done (+ recurrence spawn). Returns nothing; caller refreshes.
  const markDone = useCallback(
    async (t) => {
      const patch = {
        status: "done",
        completed_at: nowIso(),
        completed_by_user_id: me.id,
      };
      const updated = await updateRow("tasks", t.id, patch);
      audit("task", t.id, "completed", null, { on_time: onTime(updated) });
      if (t.recurrence && t.recurrence !== "none") {
        const step = t.recurrence === "daily" ? 1 : 7;
        const nd = shiftStr(t.due_date, step);
        await insertRow("tasks", {
          title: t.title,
          description: t.description,
          assignee_user_id: t.assignee_user_id,
          project_id: t.project_id,
          key_result_id: t.key_result_id,
          status: "not_started",
          due_date: nd,
          original_due_date: nd,
          planned_for_date: nd,
          acceptance_required: t.acceptance_required,
          client_facing: t.client_facing,
          recurrence: t.recurrence,
          recurrence_config: t.recurrence_config,
          definition_of_done: (t.definition_of_done || []).map((d) => ({
            text: d.text,
            done: false,
          })),
        });
      }
    },
    [me, audit]
  );

  // Apply a status transition with DoD gate + acceptance routing.
  // Returns { ok, message }. Does not refresh unless opts.refresh !== false.
  const applyStatus = useCallback(
    async (t, newStatus, opts = {}) => {
      if (newStatus === "done") {
        const dod = t.definition_of_done || [];
        if (dod.length && dod.some((d) => !d.done)) {
          return {
            ok: false,
            message: "Finish every Definition-of-Done item before marking this done.",
          };
        }
        if (t.acceptance_required) {
          await updateRow("tasks", t.id, { status: "done_pending_acceptance" });
          audit("task", t.id, "submitted_for_acceptance", null, null);
        } else {
          await markDone(t);
        }
      } else {
        const patch = { status: newStatus };
        if (newStatus !== "done_pending_acceptance") {
          patch.completed_at = null;
          patch.completed_by_user_id = null;
        }
        await updateRow("tasks", t.id, patch);
        audit("task", t.id, "status_changed", null, { status: newStatus });
      }
      if (opts.refresh !== false) await refresh();
      return { ok: true };
    },
    [markDone, audit, refresh]
  );

  const quickToggle = useCallback(
    async (id) => {
      const t = db.tasks.find((x) => x.id === id);
      if (!t || !canEditTask(t)) return { ok: false };
      if (t.status === "done" || t.status === "done_pending_acceptance") {
        await updateRow("tasks", t.id, {
          status: "in_progress",
          completed_at: null,
          completed_by_user_id: null,
        });
        audit("task", t.id, "reopened", null, null);
        await refresh();
        return { ok: true };
      }
      return applyStatus(t, "done");
    },
    [db.tasks, canEditTask, applyStatus, audit, refresh]
  );

  // Replace a task's dependency people with the given set of user ids.
  const syncTaskDeps = useCallback(async (taskId, userIds) => {
    await supabase.from("task_dependencies").delete().eq("task_id", taskId);
    const unique = [...new Set((userIds || []).filter(Boolean))];
    if (unique.length) {
      const { error } = await supabase
        .from("task_dependencies")
        .insert(unique.map((uid) => ({ task_id: taskId, user_id: uid })));
      if (error) throw error;
    }
  }, []);

  // Create or edit a task. `form` carries the modal fields. `opts.reason` is a
  // due-date-change reason gathered by the caller when required.
  const saveTask = useCallback(
    async (existing, form, opts = {}) => {
      const reason = opts.reason || "";
      if (existing) {
        const patch = {
          title: form.title,
          description: form.description,
          assignee_user_id: form.assignee_user_id,
          project_id: form.project_id,
          key_result_id: form.key_result_id || null, // Key Result is optional
          planned_for_date: form.planned_for_date,
          client_facing: form.client_facing,
          recurrence: form.recurrence,
          acceptance_required: form.acceptance_required,
          definition_of_done: form.definition_of_done,
          due_date: form.due_date,
        };
        if (form.due_date !== existing.due_date) {
          patch.due_date_history = [
            ...(existing.due_date_history || []),
            {
              old_date: existing.due_date,
              new_date: form.due_date,
              changed_by: me.id,
              at: nowIso(),
              reason,
            },
          ];
          patch.due_date_change_count = (existing.due_date_change_count || 0) + 1;
          audit("task", existing.id, "due_date_changed", { old: existing.due_date }, { new: form.due_date });
        }
        await updateRow("tasks", existing.id, patch);
        await syncTaskDeps(existing.id, form.depends_on_user_ids);
        audit("task", existing.id, "edited", null, null);
        let statusRes = { ok: true };
        if (form.status !== existing.status) {
          statusRes = await applyStatus({ ...existing, ...patch }, form.status, { refresh: false });
        }
        await refresh();
        return statusRes; // lets the modal surface the DoD gate message
      } else {
        const created = await insertRow("tasks", {
          title: form.title,
          description: form.description,
          assignee_user_id: form.assignee_user_id,
          project_id: form.project_id,
          key_result_id: form.key_result_id || null, // Key Result is optional
          status: form.status === "done" ? "not_started" : form.status,
          due_date: form.due_date,
          original_due_date: form.due_date,
          planned_for_date: form.planned_for_date,
          acceptance_required: form.acceptance_required,
          client_facing: form.client_facing,
          recurrence: form.recurrence,
          definition_of_done: form.definition_of_done,
        });
        audit("task", created.id, "created", null, null);
        await syncTaskDeps(created.id, form.depends_on_user_ids);
        if (form.status === "done") {
          await applyStatus(created, "done", { refresh: false });
        }
        await refresh();
        return created;
      }
    },
    [me, applyStatus, audit, refresh, syncTaskDeps]
  );

  const acceptTask = useCallback(
    async (id, accept, reason = "") => {
      const t = db.tasks.find((x) => x.id === id);
      const k = KR(t.key_result_id);
      const allowed = isManager() || (k && k.owner_user_id === me.id);
      if (!allowed) return { ok: false, message: "Only a manager or the KR owner can accept this." };
      if (accept) {
        await updateRow("tasks", id, {
          accepted_by_user_id: me.id,
          status: "done",
          completed_at: nowIso(),
          completed_by_user_id: me.id,
        });
        audit("task", id, "accepted", null, null);
      } else {
        await updateRow("tasks", id, {
          status: "in_progress",
          reopened_count: (t.reopened_count || 0) + 1,
        });
        audit("task", id, "rejected", null, { reason });
      }
      await refresh();
      return { ok: true };
    },
    [db.tasks, KR, me, audit, refresh]
  );

  const cancelTask = useCallback(
    async (id, reason) => {
      await updateRow("tasks", id, { status: "cancelled", cancelled_reason: reason });
      audit("task", id, "cancelled", null, { reason });
      await refresh();
    },
    [audit, refresh]
  );

  // Admin-only hard delete (RLS tasks_delete is admin-only too).
  const deleteTask = useCallback(
    async (id) => {
      await deleteRow("tasks", id);
      audit("task", id, "deleted", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  // Admin-only bulk delete — one confirmation, several deletes (each checked by RLS).
  const deleteTasks = useCallback(
    async (ids) => {
      for (const id of ids) {
        await deleteRow("tasks", id);
        audit("task", id, "deleted", null, null);
      }
      await refresh();
    },
    [audit, refresh]
  );

  // Bulk actions for the admin All Tasks view.
  const reassignTasks = useCallback(
    async (ids, userId) => {
      for (const id of ids) {
        await updateRow("tasks", id, { assignee_user_id: userId });
        audit("task", id, "reassigned", null, { assignee_user_id: userId });
      }
      await refresh();
    },
    [audit, refresh]
  );

  const rescheduleTasks = useCallback(
    async (ids, date) => {
      for (const id of ids) {
        const t = db.tasks.find((x) => x.id === id);
        if (!t || t.due_date === date) continue;
        await updateRow("tasks", id, {
          due_date: date,
          planned_for_date: date,
          due_date_change_count: (t.due_date_change_count || 0) + 1,
          due_date_history: [
            ...(t.due_date_history || []),
            { old_date: t.due_date, new_date: date, changed_by: me.id, at: nowIso(), reason: "bulk reschedule" },
          ],
        });
        audit("task", id, "due_date_changed", { old: t.due_date }, { new: date });
      }
      await refresh();
    },
    [db.tasks, me, audit, refresh]
  );

  // =========================================================================
  // BLOCKER MUTATIONS
  // =========================================================================
  const createBlocker = useCallback(
    async ({ description, task_id = null, owner_user_id = null }) => {
      await insertRow("blockers", {
        task_id,
        raised_by_user_id: me.id,
        description,
        owner_user_id,
        status: "open",
      });
      if (task_id) {
        const tk = db.tasks.find((t) => t.id === task_id);
        if (tk && tk.status !== "done" && tk.status !== "cancelled") {
          await updateRow("tasks", task_id, { status: "blocked" });
        }
      }
      audit("blocker", null, "raised", null, { description });
      await refresh();
    },
    [me, db.tasks, audit, refresh]
  );

  const assignHelper = useCallback(
    async (id, ownerId) => {
      await updateRow("blockers", id, { owner_user_id: ownerId });
      audit("blocker", id, "helper_assigned", null, { owner: ownerId });
      await refresh();
    },
    [audit, refresh]
  );

  const resolveBlocker = useCallback(
    async (id) => {
      await updateRow("blockers", id, { status: "resolved", resolved_at: nowIso() });
      audit("blocker", id, "resolved", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  // =========================================================================
  // STANDUP
  // =========================================================================
  const submitStandup = useCallback(
    async ({ doneIds = [], newTitles = [], blockerText = "" }) => {
      const t = todayStr();
      for (const id of doneIds) {
        const tk = db.tasks.find((x) => x.id === id);
        if (tk) await applyStatus(tk, "done", { refresh: false });
      }
      const defP = activeProjects()[0];
      const defK = db.keyResults[0];
      for (const title of newTitles) {
        await insertRow("tasks", {
          title,
          assignee_user_id: me.id,
          project_id: defP ? defP.id : null,
          key_result_id: defK ? defK.id : null,
          status: "not_started",
          due_date: t,
          original_due_date: t,
          planned_for_date: t,
        });
      }
      if (blockerText) {
        await insertRow("blockers", {
          task_id: null,
          raised_by_user_id: me.id,
          description: blockerText,
          owner_user_id: null,
          status: "open",
        });
      }
      // Reload so today's planned ids reflect the new + completed tasks.
      const fresh = await loadAll();
      const todayIds = fresh.tasks
        .filter(
          (x) =>
            x.assignee_user_id === me.id &&
            x.planned_for_date === t &&
            OPEN_STATUSES.includes(x.status)
        )
        .map((x) => x.id);
      await upsertRow(
        "standup_entries",
        {
          user_id: me.id,
          date: t,
          yesterday_completed_task_ids: doneIds,
          today_task_ids: todayIds,
          blockers_text: blockerText,
          submitted_at: nowIso(),
        },
        "user_id,date"
      );
      audit("standup", null, "submitted", null, null);
      await refresh();
    },
    [db.tasks, db.keyResults, activeProjects, me, applyStatus, audit, refresh]
  );

  // =========================================================================
  // KEY RESULTS / OKR MUTATIONS
  // =========================================================================
  const saveCheckin = useCallback(
    async (krId, { current_value, confidence, note }) => {
      const k = KR(krId);
      const old = { current: k.current_value, confidence: k.confidence };
      const history = [
        ...(k.checkin_history || []),
        { week: isoWeek(), value: current_value, confidence, note: note || "" },
      ];
      await updateRow("key_results", krId, {
        current_value,
        confidence,
        last_checkin_at: nowIso(),
        checkin_history: history,
      });
      audit("keyresult", krId, "checkin", old, { current: current_value, confidence });
      await refresh();
    },
    [KR, audit, refresh]
  );

  const scoreKR = useCallback(
    async (krId, { final_score, retro_notes }) => {
      await updateRow("key_results", krId, { final_score, retro_notes });
      audit("keyresult", krId, "scored", null, { final_score });
      await refresh();
    },
    [audit, refresh]
  );

  const createObjective = useCallback(
    async (data) => {
      const row = await insertRow("objectives", data);
      audit("objective", row.id, "created", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  const createKR = useCallback(
    async (data) => {
      const row = await insertRow("key_results", data);
      audit("keyresult", row.id, "created", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  const updateKR = useCallback(
    async (id, data) => {
      await updateRow("key_results", id, data);
      audit("keyresult", id, "edited", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  // =========================================================================
  // PROJECTS / USERS
  // =========================================================================
  const createProject = useCallback(
    async (data) => {
      const row = await insertRow("projects", data);
      audit("project", row.id, "created", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  const updateProject = useCallback(
    async (id, data) => {
      await updateRow("projects", id, data);
      audit("project", id, "edited", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  const updateUser = useCallback(
    async (id, data) => {
      await updateRow("profiles", id, data);
      audit("user", id, "edited", null, data);
      await refresh();
    },
    [audit, refresh]
  );

  // Admin-only: remove a user entirely (revokes their login). Runs the
  // admin_delete_user() SECURITY DEFINER function, which re-checks the caller
  // is an admin at the database level.
  const deleteUser = useCallback(
    async (id) => {
      const { error } = await supabase.rpc("admin_delete_user", { target: id });
      if (error) throw error;
      audit("user", id, "deleted", null, null);
      await refresh();
    },
    [audit, refresh]
  );

  // =========================================================================
  // WEEKLY PRIORITIES
  // =========================================================================
  const createWeeklyPriority = useCallback(
    async (data) => {
      await insertRow("weekly_priorities", data);
      await refresh();
    },
    [refresh]
  );

  // =========================================================================
  // CSV IMPORT (My Tasks → Import from spreadsheet)
  // =========================================================================
  const STATUS_FROM_LABEL = {
    "": "not_started",
    "not started": "not_started",
    "in progress": "in_progress",
    blocked: "blocked",
    done: "done",
  };
  const RECURRENCE_FROM_LABEL = { "": "none", none: "none", daily: "daily", weekly: "weekly" };

  const importTasks = useCallback(
    async (rows) => {
      const summary = { created: 0, updated: 0, skipped: [] };

      // Read a column ignoring header case/spacing (e.g. "Key Result" / "keyresult").
      const val = (obj, name) => {
        const target = name.replace(/\s+/g, "").toLowerCase();
        const key = Object.keys(obj).find(
          (k) => k.replace(/\s+/g, "").toLowerCase() === target
        );
        return key ? (obj[key] ?? "").toString().trim() : "";
      };
      const friendly = (e) => {
        const m = e?.message || String(e);
        if (/row-level security/i.test(m))
          return "you don't have permission (check the assignee and your role)";
        return m;
      };

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2; // +1 for header, +1 for 1-based rows
        const skip = (reason) => summary.skipped.push({ row: rowNum, reason });

        const taskId = val(r, "Task ID");
        const title = val(r, "Title");
        const description = val(r, "Description");
        const projectName = val(r, "Project");
        const krTitle = val(r, "Key Result");
        const assigneeEmail = val(r, "Assignee Email");
        const dueDate = val(r, "Due Date");
        const statusLabel = val(r, "Status").toLowerCase();
        const recurrenceLabel = val(r, "Recurrence").toLowerCase();

        if (!title) {
          skip("Title is blank");
          continue;
        }
        const project = db.projects.find(
          (p) => p.name.trim().toLowerCase() === projectName.toLowerCase()
        );
        if (!projectName) {
          skip("Project is blank");
          continue;
        }
        if (!project) {
          skip(`Project "${projectName}" was not found in the app`);
          continue;
        }
        // Key Result is OPTIONAL. Blank = no KR; a name that doesn't match = skip.
        let kr = null;
        if (krTitle) {
          kr = db.keyResults.find(
            (k) => k.title.trim().toLowerCase() === krTitle.toLowerCase()
          );
          if (!kr) {
            skip(`Key Result "${krTitle}" was not found in the app`);
            continue;
          }
        }
        const assignee = db.users.find(
          (u) => u.email.trim().toLowerCase() === assigneeEmail.toLowerCase()
        );
        if (!assigneeEmail) {
          skip("Assignee Email is blank");
          continue;
        }
        if (!assignee) {
          skip(`No user with email "${assigneeEmail}" was found`);
          continue;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
          skip(`Due Date "${dueDate}" must look like YYYY-MM-DD`);
          continue;
        }
        if (!(statusLabel in STATUS_FROM_LABEL)) {
          skip(`Status "${statusLabel}" is not one of Not started / In progress / Blocked / Done`);
          continue;
        }
        if (!(recurrenceLabel in RECURRENCE_FROM_LABEL)) {
          skip(`Recurrence "${recurrenceLabel}" is not one of None / Daily / Weekly`);
          continue;
        }
        const status = STATUS_FROM_LABEL[statusLabel];
        const recurrence = RECURRENCE_FROM_LABEL[recurrenceLabel];

        const payload = {
          title,
          description,
          assignee_user_id: assignee.id,
          project_id: project.id,
          key_result_id: kr ? kr.id : null,
          due_date: dueDate,
          planned_for_date: dueDate,
          status,
          recurrence,
        };
        if (status === "done") {
          payload.completed_at = nowIso();
          payload.completed_by_user_id = me.id;
        }

        if (taskId) {
          const existing = db.tasks.find((t) => t.id === taskId);
          if (!existing) {
            skip(`Task ID "${taskId}" was not found — nothing to update`);
            continue;
          }
          try {
            await updateRow("tasks", taskId, payload); // keeps original_due_date intact
            audit("task", taskId, "imported_update", null, null);
            summary.updated++;
          } catch (e) {
            skip(`couldn't update — ${friendly(e)}`);
          }
        } else {
          try {
            const created = await insertRow("tasks", {
              ...payload,
              original_due_date: dueDate, // on-time baseline = the Due Date
            });
            audit("task", created.id, "imported_create", null, null);
            summary.created++;
          } catch (e) {
            skip(`couldn't create — ${friendly(e)}`);
          }
        }
      }

      await refresh();
      return summary;
    },
    [db.projects, db.keyResults, db.users, db.tasks, me, audit, refresh]
  );

  const value = {
    // auth + data
    session,
    authReady,
    me,
    db,
    loadingData,
    refresh,
    signIn,
    signUp,
    signOut,
    // lookups
    U,
    P,
    KR,
    OBJ,
    uname,
    pname,
    activeUsers,
    activeProjects,
    krTasks,
    taskDepUserIds,
    // role
    isAdmin,
    isManager,
    isViewer,
    seesAll,
    canEditTask,
    // pure helpers (bound for convenience)
    krProgress,
    taskDone,
    onTime,
    isOverdue: (t) => isOverdueBase(t),
    MOVE_REASON_AFTER,
    // task mutations
    saveTask,
    applyStatus,
    quickToggle,
    acceptTask,
    cancelTask,
    deleteTask,
    deleteTasks,
    reassignTasks,
    rescheduleTasks,
    // blockers
    createBlocker,
    assignHelper,
    resolveBlocker,
    // standup
    submitStandup,
    // okr
    saveCheckin,
    scoreKR,
    createObjective,
    createKR,
    updateKR,
    // projects / users
    createProject,
    updateProject,
    updateUser,
    deleteUser,
    // weekly
    createWeeklyPriority,
    // csv import
    importTasks,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
