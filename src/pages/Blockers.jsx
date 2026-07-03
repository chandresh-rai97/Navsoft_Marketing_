import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";
import BlockerCard from "../components/BlockerCard.jsx";

export default function Blockers() {
  const { db, seesAll, isViewer } = useApp();
  const modals = useModals();

  const open = db.blockers
    .filter((b) => b.status === "open")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const resolved = db.blockers
    .filter((b) => b.status === "resolved")
    .sort((a, b) => (b.resolved_at || "").localeCompare(a.resolved_at || ""));

  return (
    <>
      <PageHead
        title="Blockers"
        sub={
          seesAll()
            ? "Every open blocker across the team, oldest first, with an owner and an age."
            : "Blockers you raised, plus the team board where you can offer help."
        }
        actions={
          !isViewer() && (
            <button className="btn" onClick={modals.openBlocker}>
              + Raise a blocker
            </button>
          )
        }
      />
      <div className="panel">
        <h2>
          Open blockers <span className="muted-lbl">{open.length}</span>
        </h2>
        {open.length ? (
          open.map((b) => <BlockerCard key={b.id} b={b} />)
        ) : (
          <div className="empty">No open blockers. Nice.</div>
        )}
      </div>
      {resolved.length > 0 && (
        <div className="panel">
          <h2>
            Recently resolved <span className="muted-lbl">{resolved.length}</span>
          </h2>
          {resolved.slice(0, 6).map((b) => (
            <BlockerCard key={b.id} b={b} />
          ))}
        </div>
      )}
    </>
  );
}
