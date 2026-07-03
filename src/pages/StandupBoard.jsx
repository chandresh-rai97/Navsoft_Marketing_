import React from "react";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import BlockerCard from "../components/BlockerCard.jsx";

export default function StandupBoard() {
  const { db } = useApp();
  const openBlk = db.blockers.filter((b) => b.status === "open");

  return (
    <>
      <PageHead
        title="Standup Board"
        sub="Blockers first — assign a helper and move on."
      />
      <div className="panel" style={{ borderColor: "#eab9b9" }}>
        <h2>
          ⛔ Blockers to clear first <span className="muted-lbl">{openBlk.length}</span>
        </h2>
        {openBlk.length ? (
          openBlk.map((b) => <BlockerCard key={b.id} b={b} />)
        ) : (
          <div className="empty">No open blockers. Nothing to clear.</div>
        )}
      </div>
    </>
  );
}
