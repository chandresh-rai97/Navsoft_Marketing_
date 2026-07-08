import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";
import ReviewActions from "../components/ReviewActions.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { fmtDate } from "../lib/format.js";

// Admin sees every task awaiting acceptance; each manager sees the ones routed
// to them; viewers watch read-only.
export default function Acceptance() {
  const { db, isAdmin, isViewer, canReview, uname, pname } = useApp();
  const modals = useModals();

  const pending = db.tasks
    .filter((t) => t.status === "done_pending_acceptance")
    .filter((t) => isAdmin() || isViewer() || canReview(t))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <>
      <PageHead
        title="Acceptance"
        sub={
          isAdmin()
            ? "Every task submitted and awaiting acceptance across the team."
            : "Tasks submitted to you for review — Accept to mark Done, or Request changes."
        }
      />
      {pending.length === 0 ? (
        <div className="empty">Nothing awaiting acceptance right now.</div>
      ) : (
        pending.map((t) => (
          <div className="panel" key={t.id}>
            <h2>
              <span className="pointer" onClick={() => modals.openTask(t.id)}>{t.title}</span>
              <span className="muted-lbl">
                <ProjectDot projectId={t.project_id} />
                {pname(t.project_id)} · {uname(t.assignee_user_id)} · due {fmtDate(t.due_date)}
              </span>
            </h2>
            <ReviewActions task={t} />
          </div>
        ))
      )}
    </>
  );
}
