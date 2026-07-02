import React from "react";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import BlockerCard from "../components/BlockerCard.jsx";
import { todayStr } from "../lib/format.js";

export default function StandupBoard() {
  const { db, activeUsers } = useApp();
  const t = todayStr();
  const members = activeUsers().filter((u) => u.role === "member" || u.role === "manager");
  const openBlk = db.blockers.filter((b) => b.status === "open");
  const taskTitle = (id) => db.tasks.find((x) => x.id === id)?.title;

  return (
    <>
      <PageHead
        title="Standup Board"
        sub="Everyone's yesterday / today / blockers, side by side for the daily call. Blockers first — assign a helper and move on."
      />
      {openBlk.length > 0 && (
        <div className="panel" style={{ borderColor: "#eab9b9" }}>
          <h2>
            ⛔ Blockers to clear first <span className="muted-lbl">{openBlk.length}</span>
          </h2>
          {openBlk.map((b) => (
            <BlockerCard key={b.id} b={b} />
          ))}
        </div>
      )}
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
        {members.map((u) => {
          const s = db.standups.find((x) => x.user_id === u.id && x.date === t);
          const yList = (s ? s.yesterday_completed_task_ids : []).map(taskTitle).filter(Boolean);
          const tList = (s ? s.today_task_ids : []).map(taskTitle).filter(Boolean);
          return (
            <div className="standup-col" key={u.id}>
              <h3>
                {u.name} {s ? <span className="badge ok">in</span> : <span className="badge no">no</span>}
              </h3>
              <div className="role-s">{u.role}</div>
              <div className="su-h">Yesterday done</div>
              <ul className="su-list">
                {yList.length ? (
                  yList.map((x, i) => <li key={i}>{x}</li>)
                ) : (
                  <li style={{ color: "var(--muted)" }}>—</li>
                )}
              </ul>
              <div className="su-h">Today</div>
              <ul className="su-list">
                {tList.length ? (
                  tList.map((x, i) => <li key={i}>{x}</li>)
                ) : (
                  <li style={{ color: "var(--muted)" }}>—</li>
                )}
              </ul>
              {s && s.blockers_text && (
                <>
                  <div className="su-h">Blocker note</div>
                  <div style={{ fontSize: 12, color: "var(--red)" }}>{s.blockers_text}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
