import React, { useState } from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";
import BlockerCard from "../components/BlockerCard.jsx";
import { CONF_LABEL } from "../lib/logic.js";
import { isoWeek, pct, daysSince } from "../lib/format.js";

export default function Reviews() {
  const { db, uname, krProgress, krTasks, taskDone, isViewer } = useApp();
  const modals = useModals();
  const [tab, setTab] = useState("week");
  const week = isoWeek();

  const krRow = (k) => {
    const prog = krProgress(k);
    const tasks = krTasks(k.id);
    const done = tasks.filter(taskDone).length;
    const barCls = prog >= 0.7 ? "" : prog >= 0.4 ? "amber" : "red";
    return (
      <div key={k.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{k.title}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
              {k.current_value}/{k.target_value} {k.metric_unit} · {done}/{tasks.length} done ·{" "}
              <span className={"conf-" + k.confidence}>{CONF_LABEL[k.confidence]}</span> · {k.kr_type} · owner{" "}
              {uname(k.owner_user_id)}
              {k.last_checkin_at && ` · checked in ${daysSince(k.last_checkin_at)}d ago`}
              {k.final_score != null && ` · scored ${k.final_score}`}
            </div>
          </div>
          <div style={{ width: 120 }}>
            <div className={"bar " + barCls}>
              <i style={{ width: pct(prog) + "%" }} />
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{pct(prog)}%</div>
          </div>
          {!isViewer() && (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sm ghost" onClick={() => modals.openCheckin(k.id)}>
                Check in
              </button>
              {tab === "quarter" && (
                <button className="btn sm" onClick={() => modals.openScore(k.id)}>
                  Score
                </button>
              )}
            </div>
          )}
        </div>
        {(k.checkin_history || []).length > 0 && (
          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {k.checkin_history.map((h, i) => (
              <span className="chip" key={i}>
                {h.week}: {h.value} <span className={"conf-" + h.confidence}>●</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const priorities = db.weeklyPriorities.filter((w) => w.week === week);
  const openBlk = db.blockers.filter((b) => b.status === "open");

  return (
    <>
      <PageHead
        title="Reviews"
        sub="Run the cadence: weekly priorities & blockers, monthly KR check-ins, quarterly grading and retro notes."
      />
      <div className="filters">
        <div className="seg">
          {[["week", "Weekly"], ["month", "Monthly"], ["quarter", "Quarterly"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {tab === "week" && (
        <>
          <div className="panel">
            <h2>
              This week's priorities <span className="muted-lbl">{week} · {priorities.length}</span>
            </h2>
            {priorities.length ? (
              priorities.map((w) => {
                const k = db.keyResults.find((x) => x.id === w.key_result_id);
                return (
                  <div className="mini" key={w.id}>
                    <span>
                      {w.title} <span style={{ color: "var(--muted)" }}>· {uname(w.owner_user_id)}</span>
                    </span>
                    <span style={{ color: "var(--muted)" }}>🎯 {k ? k.title : "—"}</span>
                  </div>
                );
              })
            ) : (
              <div className="empty">No priorities committed this week.</div>
            )}
          </div>
          <div className="panel">
            <h2>
              Blockers to clear <span className="muted-lbl">{openBlk.length}</span>
            </h2>
            {openBlk.length ? (
              openBlk.map((b) => <BlockerCard key={b.id} b={b} />)
            ) : (
              <div className="empty">No open blockers.</div>
            )}
          </div>
          <div className="panel">
            <h2>KR confidence check-in</h2>
            {db.keyResults.map(krRow)}
          </div>
        </>
      )}

      {tab === "month" && (
        <div className="panel">
          <h2>Monthly KR review — progress, confidence & milestone adjustment</h2>
          {db.keyResults.length ? db.keyResults.map(krRow) : <div className="empty">No Key Results.</div>}
        </div>
      )}

      {tab === "quarter" && (
        <div className="panel">
          <h2>Quarter-end grading & retro</h2>
          <div className="sub" style={{ marginBottom: 10 }}>
            Set each KR's final score (0.0–1.0) and capture retro notes to carry into next quarter.
          </div>
          {db.keyResults.map((k) => (
            <div key={k.id}>
              {krRow(k)}
              {k.retro_notes && (
                <div style={{ fontSize: 12, color: "var(--muted)", padding: "0 0 8px 2px" }}>
                  📝 {k.retro_notes}
                </div>
              )}
            </div>
          ))}
          {db.keyResults.length === 0 && <div className="empty">No Key Results to grade.</div>}
        </div>
      )}
    </>
  );
}
