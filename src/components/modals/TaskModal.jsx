import React, { useState } from "react";
import Modal from "../Modal.jsx";
import ReviewActions from "../ReviewActions.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";
import { STATUSES, STATUS_LABEL, MOVE_REASON_AFTER } from "../../lib/logic.js";
import { todayStr, fmtDate } from "../../lib/format.js";

const EDITABLE_STATUSES = STATUSES.filter((s) => s !== "carried_forward");
const MEMBER_STATUSES = ["not_started", "in_progress", "blocked"]; // members submit for review, never set Done

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
    scopedProjects,
    KR,
    uname,
    taskDepUserIds,
    isOverdue,
    saveTask,
    cancelTask,
    usesReview,
    reviewerId,
    isProjectManager,
    taskCollaboratorIds,
    submitForReview,
    addTaskCollaborator,
    removeTaskCollaborator,
  } = app;

  const existing = id ? db.tasks.find((x) => x.id === id) : null;
  // Members can't open tasks that aren't theirs (unless they're a collaborator).
  const iAmCollaborator = existing ? taskCollaboratorIds(existing.id).includes(me.id) : false;
  if (existing && !seesAll() && existing.assignee_user_id !== me.id && !iAmCollaborator) {
    onClose();
    return null;
  }
  const editing = !!existing;
  const readOnly = isViewer();
  const assignees = readOnly ? [me] : activeUsers();
  // Managers can only create tasks in projects they manage.
  const projectChoices = (() => {
    const base = me.role === "manager" ? scopedProjects() : activeProjects();
    if (existing?.project_id && !base.find((p) => p.id === existing.project_id)) {
      const cur = db.projects.find((p) => p.id === existing.project_id);
      if (cur) return [cur, ...base];
    }
    return base;
  })();

  const [form, setForm] = useState(() => ({
    title: existing?.title || "",
    description: existing?.description || "",
    assignee_user_id: existing?.assignee_user_id || me.id,
    status: existing?.status && existing.status !== "carried_forward" ? existing.status : "not_started",
    project_id:
      existing?.project_id ||
      (me.role === "manager" ? scopedProjects()[0]?.id : activeProjects()[0]?.id) ||
      "",
    key_result_id: existing?.key_result_id || "",
    due_date: existing?.due_date || todayStr(),
    planned_for_date: existing?.planned_for_date || todayStr(),
    client_facing: !!existing?.client_facing,
    recurrence: existing?.recurrence || "none",
    acceptance_required: !!existing?.acceptance_required,
  }));
  const [depIds, setDepIds] = useState(() => (existing ? taskDepUserIds(existing.id) : []));
  const [dod, setDod] = useState(() =>
    (existing?.definition_of_done || []).map((d) => ({ text: d.text, done: !!d.done }))
  );
  const [newDod, setNewDod] = useState("");
  const [proofLink, setProofLink] = useState(existing?.proof_link || "");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const autoAccept = (krId, client) => {
    const k = KR(krId);
    if ((k && k.kr_type === "committed") || client) set("acceptance_required", true);
  };
  const onKr = (v) => { set("key_result_id", v); autoAccept(v, form.client_facing); };
  const onClient = (v) => { set("client_facing", v); autoAccept(form.key_result_id, v); };

  const canWrite = !readOnly && (!editing || canEditTask(existing) || iAmCollaborator);

  // Review-workflow state
  const reviewFlow = existing ? usesReview(existing) : true; // new tasks use the review flow
  const isMine = existing && existing.assignee_user_id === me.id;
  const inReview = editing && (existing.status === "done_pending_acceptance" || existing.status === "changes_requested");
  const canSubmit =
    editing && reviewFlow && isMine && !readOnly &&
    ["not_started", "in_progress", "blocked", "changes_requested", "carried_forward"].includes(existing.status);
  const reviewerName = existing ? uname(reviewerId(existing)) : "";

  // Status choices: members on review-flow tasks can't set Done — they submit.
  let statusOptions = isManager() || !reviewFlow ? EDITABLE_STATUSES : MEMBER_STATUSES;
  if (!statusOptions.includes(form.status)) statusOptions = [form.status, ...statusOptions];

  // Collaborators (temporary managers on this task) — managed by the project's manager.
  const canManageCollab =
    editing && isProjectManager(existing.project_id) && !["done", "cancelled"].includes(existing.status);
  const collabIds = editing ? taskCollaboratorIds(existing.id) : [];
  const managerCandidates = activeUsers().filter(
    (u) => (u.role === "manager" || u.role === "admin") && u.id !== existing?.assignee_user_id
  );

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
          if (reason === null) { setBusy(false); return; }
        }
      }
      const cleanDod = dod.filter((d) => d.text.trim());
      const res = await saveTask(
        existing,
        { ...form, definition_of_done: cleanDod, depends_on_user_ids: depIds },
        { reason }
      );
      if (res && res.ok === false) { setBusy(false); return dlg.alert(res.message); }
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  async function handleSubmit() {
    setBusy(true);
    const r = await submitForReview(existing.id, proofLink.trim());
    setBusy(false);
    if (r && r.ok === false) return dlg.alert(r.message);
    onClose();
  }

  async function handleCancelTask() {
    const reason = await dlg.prompt("Reason for cancelling this task?");
    if (reason === null) return;
    await cancelTask(existing.id, reason);
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <h2>{editing ? (readOnly ? "Task" : "Edit task") : "New task"}</h2>

      {/* Reviewer sees proof + Accept / Request changes; others see the outcome. */}
      {inReview && <ReviewActions task={existing} onDone={onClose} />}

      {/* Member submits for review, with a proof link. */}
      {canSubmit && (
        <div className="panel" style={{ background: "var(--accent-soft)", borderColor: "#bfe0d9" }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Task proof (link)</label>
            <input
              value={proofLink}
              onChange={(e) => setProofLink(e.target.value)}
              placeholder="Paste a link to your work (doc, drive, PR…)"
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <div style={{ flex: 1, fontSize: 11.5, color: "#0c5e53" }}>
              Submitting sends this task and its proof to <strong>{reviewerName}</strong> to review.
            </div>
            <button className="btn accent" onClick={handleSubmit} disabled={busy}>
              {busy ? "…" : "Submit for review"}
            </button>
          </div>
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
            {statusOptions.map((s) => (
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
            {projectChoices.map((p) => (
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
          <select value="" onChange={(e) => { const v = e.target.value; if (v && !depIds.includes(v)) setDepIds([...depIds, v]); }}>
            <option value="">+ add a person…</option>
            {activeUsers().filter((u) => !depIds.includes(u.id)).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {depIds.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Nobody — this task isn't waiting on anyone.</span>
          ) : (
            depIds.map((uid) => (
              <span key={uid} className="chip">
                {uname(uid)}
                {!readOnly && (
                  <span className="danger-link" style={{ marginLeft: 4, textDecoration: "none" }} onClick={() => setDepIds(depIds.filter((x) => x !== uid))}>×</span>
                )}
              </span>
            ))
          )}
        </div>
      </div>

      {canManageCollab && (
        <div className="field">
          <label>Temporary collaborators — managers (optional)</label>
          <select value="" onChange={(e) => { const v = e.target.value; if (v) addTaskCollaborator(existing.id, v); }}>
            <option value="">+ add a manager…</option>
            {managerCandidates.filter((u) => !collabIds.includes(u.id)).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {collabIds.map((uid) => (
              <span key={uid} className="chip">
                {uname(uid)}
                <span className="danger-link" style={{ marginLeft: 4, textDecoration: "none" }} onClick={() => removeTaskCollaborator(existing.id, uid)}>×</span>
              </span>
            ))}
          </div>
          <div className="hint">Added managers can see and work this task until it's Done, then lose access automatically.</div>
        </div>
      )}

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
              <input type="checkbox" checked={d.done} disabled={readOnly} onChange={(e) => setDod((arr) => arr.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
              <span style={{ flex: 1 }}>{d.text}</span>
              {!readOnly && (
                <span className="danger-link" onClick={() => setDod((arr) => arr.filter((_, j) => j !== i))}>remove</span>
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
              onKeyDown={(e) => { if (e.key === "Enter" && newDod.trim()) { setDod((a) => [...a, { text: newDod.trim(), done: false }]); setNewDod(""); } }}
            />
            <button className="btn sm ghost" onClick={() => { if (!newDod.trim()) return; setDod((a) => [...a, { text: newDod.trim(), done: false }]); setNewDod(""); }}>Add</button>
          </div>
        )}
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
