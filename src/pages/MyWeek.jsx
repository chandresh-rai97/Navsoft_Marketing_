import React, { useState } from "react";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import { CONF_LABEL } from "../lib/logic.js";
import { isoWeek, pct } from "../lib/format.js";

export default function MyWeek() {
  const { db, me, KR, krProgress, krTasks, taskDone, createWeeklyPriority } = useApp();
  const week = isoWeek();
  const [title, setTitle] = useState("");
  const [krId, setKrId] = useState(db.keyResults[0]?.id || "");
  const [busy, setBusy] = useState(false);

  const mine = db.weeklyPriorities.filter((w) => w.owner_user_id === me.id && w.week === week);

  async function add() {
    if (!title.trim() || !krId) return;
    setBusy(true);
    try {
      await createWeeklyPriority({
        title: title.trim(),
        owner_user_id: me.id,
        key_result_id: krId,
        week,
      });
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="My Week"
        sub={`Your 3–5 committed priorities for ${week}, and how they ladder up to Key Results.`}
      />

      <div className="panel">
        <h2>Commit a priority {mine.length >= 5 && <span className="muted-lbl">5+ — keep it focused</span>}</h2>
        <div className="row2">
          <div className="field" style={{ flex: 2 }}>
            <label>Priority</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The one outcome that matters most this week"
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </div>
          <div className="field">
            <label>Serves Key Result</label>
            <select value={krId} onChange={(e) => setKrId(e.target.value)}>
              {db.keyResults.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={add} disabled={busy}>
            + Add priority
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>
          This week's priorities <span className="muted-lbl">{mine.length}</span>
        </h2>
        {mine.length === 0 ? (
          <div className="empty">No priorities committed yet. Add 3–5 above.</div>
        ) : (
          mine.map((w) => {
            const k = KR(w.key_result_id);
            const prog = k ? krProgress(k) : 0;
            const tasks = k ? krTasks(k.id).filter((t) => t.assignee_user_id === me.id) : [];
            const done = tasks.filter(taskDone).length;
            const barCls = prog >= 0.7 ? "" : prog >= 0.4 ? "amber" : "red";
            return (
              <div key={w.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{w.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 6px" }}>
                  🎯 {k ? k.title : "No KR"} · {k ? CONF_LABEL[k.confidence] : ""} · my tasks {done}/{tasks.length}
                </div>
                <div className={"bar " + barCls}>
                  <i style={{ width: pct(prog) + "%" }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
