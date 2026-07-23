import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";
import ReviewActions from "../components/ReviewActions.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { REVIEW_STALE_DAYS } from "../lib/logic.js";
import { fmtDate, daysSince } from "../lib/format.js";

function waitLabel(days) {
  if (days == null) return "waiting —";
  if (days < 1) return "waiting today";
  return `waiting ${days}d`;
}

// Admin sees every task awaiting acceptance; each manager sees the ones routed
// to them; viewers watch read-only. Oldest-waiting first, with the delay shown
// so the reviewer (not the member) is the one chased.
export default function Acceptance() {
  const { db, isAdmin, isViewer, canReview, uname, pname } = useApp();
  const modals = useModals();

  const pending = db.tasks
    .filter((t) => t.status === "done_pending_acceptance")
    .filter((t) => isAdmin() || isViewer() || canReview(t))
    .map((t) => ({ t, waited: t.submitted_at ? daysSince(t.submitted_at) : null }))
    .sort((a, b) => {
      // longest wait first; unknown submit time (null) goes last
      const aw = a.waited == null ? -1 : a.waited;
      const bw = b.waited == null ? -1 : b.waited;
      return bw - aw;
    });

  return (
    <>
      <PageHead
        title="Acceptance"
        sub={
          isAdmin()
            ? "Every task submitted and awaiting acceptance across the team. Oldest waits first."
            : "Tasks submitted to you for review — Accept to mark Done, or Request changes. Oldest waits first."
        }
      />
      {pending.length === 0 ? (
        <div className="empty">Nothing awaiting acceptance right now.</div>
      ) : (
        pending.map(({ t, waited }) => {
          const stale = waited != null && waited >= REVIEW_STALE_DAYS;
          return (
            <div
              className="panel"
              key={t.id}
              style={stale ? { borderLeft: "4px solid var(--red)" } : undefined}
            >
              <h2>
                <span className="pointer" onClick={() => modals.openTask(t.id)}>{t.title}</span>
                <span className="muted-lbl">
                  <ProjectDot projectId={t.project_id} />
                  {pname(t.project_id)} · {uname(t.assignee_user_id)} · due {fmtDate(t.due_date)}
                </span>
              </h2>
              <div style={{ marginBottom: 10 }}>
                <span
                  className="tag"
                  style={
                    stale
                      ? { background: "var(--red-soft)", color: "var(--red)" }
                      : { background: "var(--paper-2)", color: "var(--muted)" }
                  }
                >
                  ⏰ {waitLabel(waited)} for review{stale ? " — please review" : ""}
                </span>
              </div>
              <ReviewActions task={t} />
            </div>
          );
        })
      )}
    </>
  );
}
