import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow, { ProjectDot } from "../components/TaskRow.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";

// "Projects" — a grid of summary boxes (one per project). Click a box to open
// that project's full task list, team, and (for its manager) member controls.
export default function Grid() {
  const {
    db,
    uname,
    taskDone,
    isOverdue,
    scopedProjects,
    activeUsers,
    isViewer,
    isProjectManager,
    projectMemberIds,
    addProjectMember,
    removeProjectMember,
  } = useApp();
  const modals = useModals();
  const { toggle, openTask } = useTaskHandlers();
  const [selected, setSelected] = useState(null);

  const projectsList = scopedProjects();

  // If the selected project disappears (e.g. archived), fall back to the grid.
  useEffect(() => {
    if (selected && !db.projects.find((x) => x.id === selected)) setSelected(null);
  }, [selected, db.projects]);

  function counts(pid) {
    const tks = db.tasks.filter((t) => t.project_id === pid && t.status !== "cancelled");
    return {
      total: tks.length,
      done: tks.filter(taskDone).length,
      overdue: tks.filter((t) => isOverdue(t)).length,
      notStarted: tks.filter((t) => t.status === "not_started").length,
      carried: tks.filter((t) => t.carry_forward_count > 0).length,
    };
  }

  // ---- summary boxes ----
  if (!selected) {
    return (
      <>
        <PageHead title="Projects" sub="One box per project. Click a box to open its full task list." />
        <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
          {projectsList.map((p) => {
            const c = counts(p.id);
            return (
              <div key={p.id} className="person-card pointer" onClick={() => setSelected(p.id)}>
                <div className="pn">
                  <ProjectDot projectId={p.id} />
                  {p.name} <span style={{ fontWeight: 400, color: "var(--muted)" }}>({uname(p.lead_user_id)})</span>
                </div>
                <div className="mini"><span>Total tasks</span><span><strong>{c.total}</strong></span></div>
                <div className="mini"><span>Done</span><span>{c.done}</span></div>
                <div className="mini"><span>Overdue</span><span className={c.overdue ? "warnflag" : ""}>{c.overdue}</span></div>
                <div className="mini"><span>Not started</span><span>{c.notStarted}</span></div>
                <div className="mini"><span>Carried forward</span><span className={c.carried ? "warnflag" : ""}>{c.carried}</span></div>
              </div>
            );
          })}
          {projectsList.length === 0 && <div className="empty">No active projects.</div>}
        </div>
      </>
    );
  }

  // ---- project detail ----
  const p = db.projects.find((x) => x.id === selected);
  if (!p) return null; // effect above will reset the selection
  const tks = db.tasks
    .filter((t) => t.project_id === p.id && t.status !== "cancelled")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const memberIds = projectMemberIds(p.id);
  const canManage = isProjectManager(p.id);

  return (
    <>
      <PageHead
        title={`${p.name} (${uname(p.lead_user_id)})`}
        sub="Full task list and team for this project."
        actions={
          <>
            <button className="btn ghost" onClick={() => setSelected(null)}>← All projects</button>
            {!isViewer() && (
              <button className="btn" onClick={() => modals.openTask(null)}>+ Task</button>
            )}
          </>
        }
      />

      <div className="panel">
        <h2>
          Team <span className="muted-lbl">{memberIds.length} member{memberIds.length === 1 ? "" : "s"}</span>
        </h2>
        {canManage && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) addProjectMember(p.id, e.target.value); }}
            style={{ marginBottom: 8 }}
          >
            <option value="">+ add any user to this project…</option>
            {activeUsers().filter((u) => !memberIds.includes(u.id)).map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="chip">Lead: {uname(p.lead_user_id)}</span>
          {memberIds.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>No extra members added yet.</span>
          ) : (
            memberIds.map((uid) => (
              <span key={uid} className="chip">
                {uname(uid)}
                {canManage && (
                  <span className="danger-link" style={{ marginLeft: 4, textDecoration: "none" }} onClick={() => removeProjectMember(p.id, uid)}>×</span>
                )}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <h2>
          Tasks <span className="muted-lbl">{tks.length}</span>
        </h2>
        {tks.length ? (
          tks.map((t) => (
            <TaskRow key={t.id} task={t} opts={{ checkable: true, showAssignee: true }} onOpen={openTask} onToggle={toggle} />
          ))
        ) : (
          <div className="empty">No tasks in this project yet.</div>
        )}
      </div>
    </>
  );
}
