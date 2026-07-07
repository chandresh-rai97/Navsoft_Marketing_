import React from "react";
import { useApp } from "../context/AppData.jsx";
import { STATUS_LABEL } from "../lib/logic.js";
import { fmtDate } from "../lib/format.js";

export function ProjectDot({ projectId }) {
  const { P } = useApp();
  const p = P(projectId);
  if (!p) return null;
  return <span className="dot" style={{ background: p.color || "#999" }} />;
}

export function StatusTag({ status }) {
  return <span className={"tag st-" + status}>{STATUS_LABEL[status] || status}</span>;
}

// Single task line — the shared row used across My Day, My Tasks, Goals, OKR tree.
export default function TaskRow({ task: t, opts = {}, onOpen, onToggle }) {
  const { P, KR, uname, pname, isOverdue, canEditTask, taskDepUserIds } = useApp();
  const overdue = isOverdue(t);
  const pinned = opts.pinnable && (overdue || t.status === "carried_forward");
  const kr = KR(t.key_result_id);
  const p = P(t.project_id);
  const dependsOn = taskDepUserIds(t.id).map(uname).filter(Boolean).join(", ");
  const checkable = opts.checkable && canEditTask(t) && t.status !== "cancelled";
  const checked = t.status === "done" || t.status === "done_pending_acceptance";

  return (
    <div className={"task-row" + (pinned ? " pinned" : "") + (t.status === "done" ? " done" : "")}>
      {checkable ? (
        <div
          className={"check" + (checked ? " on" : "")}
          onClick={(e) => {
            e.stopPropagation();
            onToggle && onToggle(t.id);
          }}
        />
      ) : (
        <div style={{ width: 19 }} />
      )}
      <div className="task-body" onClick={() => onOpen && onOpen(t.id)}>
        <div className="task-title">{t.title}</div>
        <div className="task-meta">
          <span className="chip">
            {p && <span className="dot" style={{ background: p.color || "#999" }} />}
            {pname(t.project_id)}
          </span>
          <span className="chip" title="Key Result">
            🎯 {kr ? kr.title : "No KR"}
          </span>
          {dependsOn && (
            <span className="chip" title="Depends on">
              ⛓ Depends on: {dependsOn}
            </span>
          )}
          <StatusTag status={t.status} />
          <span>
            Due {fmtDate(t.due_date)}
            {t.due_date !== t.original_due_date && (
              <span className="movedflag"> (orig {fmtDate(t.original_due_date)})</span>
            )}
          </span>
          {t.due_date_change_count > 0 && (
            <span className="movedflag">moved {t.due_date_change_count}×</span>
          )}
          {overdue && <span className="warnflag">Overdue</span>}
          {t.carry_forward_count > 0 && (
            <span className="warnflag">↻ {t.carry_forward_count}×</span>
          )}
          {opts.showAssignee && <span>· {uname(t.assignee_user_id)}</span>}
          {t.acceptance_required && (
            <span className="chip" title="Needs acceptance">
              ✔ accept
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
