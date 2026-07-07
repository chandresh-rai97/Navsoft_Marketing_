import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";
import { STATUSES, STATUS_LABEL, MOVE_REASON_AFTER } from "../../lib/logic.js";
import { todayStr, fmtDate } from "../../lib/format.js";

const EDITABLE_STATUSES = STATUSES.filter((s) => s !== "carried_forward");

export default function TaskModal({ id, onClose }) {
  const app = useApp();
  const dlg = useDialog();
  const {
    db,
    me,
    seesAll,
    isManager,
    isViewer,
    canEditTask,
    activeUsers,
    activeProjects,
    KR,
    uname,
    taskDepUserIds,
    isOverdue,
    saveTask,
    cancelTask,
    acceptTask,
  } = app;

  const existing = id ? db.tasks.find((x) => x.id === id) : null;
  // Members can't open tasks that aren't theirs.
  if (existing && !seesAll() && existing.assignee_user_id !== me.id) {
    onClose();
    return null;
  }
  const editing = !!existing;
  const readOnly = isViewer(); // viewers can look but never change anything
  // Any non-viewer can assign a task to anyone on the team.
  const assignees = readOnly ? [me] : activeUsers();

  const [form, setForm] = useState(() => ({
    title: existing?.title || "",
    description: existing?.description || "",
    assignee_user_id: existing?.assignee_user_id || me.id,
    status: existing?.status && existing.status !== "carried_forward" ? existing.status : "not_started",
    project_id: existing?.project_id || activeProjects()[0]?.id || "",
    key_result_id: existing?.key_result_id || "", // Key Result is optional
    due_date: existing?.due_date || todayStr(),
    planned_for_date: existing?.planned_for_date || todayStr(),
    client_facing: !!existing?.client_facing,
    recurrence: existing?.recurrence || "none",
    acceptance_required: !!existing?.acceptance_required,
  }));
  // Multiple dependency people; seeded from the junction table for existing tasks.
  const [depIds, setDepIds] = useState(() => (existing ? taskDepUserIds(existing.id) : []));
  const [dod, setDod] = useState(() =>
    (existing?.definition_of_done || []).map((d) => ({ text: d.text, done: !!d.done }))
  );
  const [newDod, setNewDod] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-require acceptance for committed KRs or client-facing work (never auto-clears).
  const autoAccept = (krId, client) => {
    const k = KR(krId);
    if ((k && k.kr_type === "committed") || client) set("acceptance_required", true);
  };
  const onKr = (v) => {
    set("key_result_id", v);
    autoAccept(v, form.client_facing);
  };
  const onClient = (v) => {
    set("client_facing", v);
    autoAccept(form.key_result_id, v);
  };

  const canWrite = !readOnly && (!editing || canEditTask(existing));

  async function handleSave() {
    if (!form.title.trim()) return dlg.alert("Give the task a title.");
    if (!form.project_id) return dlg.alert("Every task must have a project.");
    setBusy(true);
    try {
      let reason = "";
      if (editing && form.due_date !== existing.due_date) {
        const overdueNow = isOverdue(existing);
        if (overdueNow || existing.due_date_change_count >= MOVE_REASON_AFTER) {
          reason = await dlg.prompt(
            `This task ${overdueNow ? "is overdue" : "has moved several times"}. Add a reason for moving the date:`
          );
          if (reason === null) {
            setBusy(false);
            return;
          }
        }
      }
      const cleanDod = dod.filter((d) => d.text.trim());
      const res = await saveTask(
        existing,
        { ...form, definition_of_done: cleanDod, depends_on_user_ids: depIds },
        { reason }
      );
      if (res && res.ok === false) {
        setBusy(false);
        return dlg.alert(res.message);
      }
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  async function handleCancelTask() {
    const reason = await dlg.prompt("Reason for cancelling this task?");
    if (reason === null) return;
    await cancelTask(existing.id, reason);
    onClose();
  }

  const kr = existing ? KR(existing.key_result_id) : null;
  const showAccept =
    editing &&
    existing.status === "done_pending_acceptance" &&
    (isManager() || (kr && kr.owner_user_id === me.id));

  async function doAccept(accept) {
    if (accept) {
      await acceptTask(existing.id, true);
      onClose();
    } else {
      const reason = await dlg.prompt("Reason for sending it back?");
      if (reason === null) return;
      await acceptTask(existing.id, false, reason);
      onClose();
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>{editing ? (readOnly ? "Task" : "Edit task") : "New task"}</h2>

      {showAccept && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <div className="note" style={{ margin: 0, flex: 1 }}>This task is awaiting acceptance.</div>
          <button className="btn accent" onClick={() => doAccept(true)}>Accept</button>
          <button className="btn ghost" onClick={() => doAccept(false)}>Send back</button>
        </div>
      )}

      <div className="field">
        <label>Title</label>
        <input value={form.title} disabled={readOnly} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?" />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={form.description} disabled={readOnly} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Assignee</label>
          <select value={form.assignee_user_id} disabled={readOnly} onChange={(e) => set("assignee_user_id", e.target.value)}>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.status} disabled={readOnly} onChange={(e) => set("status", e.target.value)}>
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Project *</label>
          <select value={form.project_id} disabled={readOnly} onChange={(e) => set("project_id", e.target.value)}>
            <option value="">— pick —</option>
            {activeProjects().map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Key Result (optional)</label>
          <select value={form.key_result_id} disabled={readOnly} onChange={(e) => onKr(e.target.value)}>
            <option value="">— none —</option>
            {db.keyResults.map((k) => (
              <option key={k.id} value={k.id}>{k.title}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Depends on — people (optional)</label>
        {!readOnly && (
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v && !depIds.includes(v)) setDepIds([...depIds, v]);
            }}
          >
            <option value="">+ add a person…</option>
            {activeUsers()
              .filter((u) => !depIds.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
          </select>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {depIds.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Nobody — this task isn't waiting on anyone.
            </span>
          ) : (
            depIds.map((uid) => (
              <span key={uid} className="chip">
                {uname(uid)}
                {!readOnly && (
                  <span
                    className="danger-link"
                    style={{ marginLeft: 4, textDecoration: "none" }}
                    onClick={() => setDepIds(depIds.filter((x) => x !== uid))}
                  >
                    ×
                  </span>
                )}
              </span>
            ))
          )}
        </div>
        <div className="hint">Everyone this task is waiting on before it can move.</div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Due date</label>
          <input type="date" value={form.due_date} disabled={readOnly} onChange={(e) => set("due_date", e.target.value)} />
        </div>
        <div className="field">
          <label>Planned for</label>
          <input type="date" value={form.planned_for_date} disabled={readOnly} onChange={(e) => set("planned_for_date", e.target.value)} />
        </div>
      </div>
      {editing && existing.due_date !== existing.original_due_date && (
        <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
          On-time baseline (original due): <strong>{fmtDate(existing.original_due_date)}</strong> · moved {existing.due_date_change_count}×
        </div>
      )}
      <div className="row2">
        <div className="field">
          <label>Client-facing</label>
          <select value={form.client_facing ? "1" : "0"} disabled={readOnly} onChange={(e) => onClient(e.target.value === "1")}>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>
        <div className="field">
          <label>Recurrence</label>
          <select value={form.recurrence} disabled={readOnly} onChange={(e) => set("recurrence", e.target.value)}>
            {["none", "daily", "weekly"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Definition of done (optional checklist)</label>
        <div>
          {dod.map((d, i) => (
            <div className="dod-item" key={i}>
              <input
                type="checkbox"
                checked={d.done}
                disabled={readOnly}
                onChange={(e) => setDod((arr) => arr.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
              />
              <span style={{ flex: 1 }}>{d.text}</span>
              {!readOnly && (
                <span className="danger-link" onClick={() => setDod((arr) => arr.filter((_, j) => j !== i))}>
                  remove
                </span>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              placeholder="Add a checklist item"
              value={newDod}
              style={{ flex: 1 }}
              onChange={(e) => setNewDod(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDod.trim()) {
                  setDod((a) => [...a, { text: newDod.trim(), done: false }]);
                  setNewDod("");
                }
              }}
            />
            <button
              className="btn sm ghost"
              onClick={() => {
                if (!newDod.trim()) return;
                setDod((a) => [...a, { text: newDod.trim(), done: false }]);
                setNewDod("");
              }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div className="field">
        <label style={{ display: "flex", gap: 8, alignItems: "center", textTransform: "none" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={form.acceptance_required}
            disabled={readOnly}
            onChange={(e) => set("acceptance_required", e.target.checked)}
          />
          Requires acceptance before it counts as done
        </label>
      </div>

      <div className="modal-actions">
        {editing && canWrite && (
          <button className="danger-link" onClick={handleCancelTask}>Cancel task</button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>Close</button>
        {canWrite && (
          <button className="btn" onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </Modal>
  );
}
