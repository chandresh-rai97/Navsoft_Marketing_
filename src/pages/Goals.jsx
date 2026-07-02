import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { CONF_LABEL } from "../lib/logic.js";
import { pct } from "../lib/format.js";

function KRCard({ k }) {
  const { me, krProgress, krTasks, taskDone, uname, isManager } = useApp();
  const modals = useModals();
  const { toggle, openTask } = useTaskHandlers();
  const prog = krProgress(k);
  const tasks = krTasks(k.id);
  const done = tasks.filter(taskDone).length;
  const barCls = prog >= 0.7 ? "" : prog >= 0.4 ? "amber" : "red";
  const mine = tasks.filter((t) => t.assignee_user_id === me.id);
  const canCheckin = isManager() || k.owner_user_id === me.id;

  return (
    <div className="panel">
      <h2>
        {k.title}{" "}
        <span className={"muted-lbl conf-" + k.confidence}>
          {CONF_LABEL[k.confidence]} · {k.kr_type}
        </span>
      </h2>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        Metric: {k.current_value} / {k.target_value} {k.metric_unit} (from {k.start_value})
      </div>
      <div className={"bar " + barCls}>
        <i style={{ width: pct(prog) + "%" }} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--muted)",
          marginTop: 5,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span>
          Metric progress <strong style={{ color: "var(--ink)" }}>{pct(prog)}%</strong>
        </span>
        <span>
          Task completion{" "}
          <strong style={{ color: "var(--ink)" }}>
            {done}/{tasks.length}
          </strong>
        </span>
        <span>Owner {uname(k.owner_user_id)}</span>
      </div>
      {mine.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {mine.map((t) => (
            <TaskRow key={t.id} task={t} opts={{ checkable: true }} onOpen={openTask} onToggle={toggle} />
          ))}
        </div>
      )}
      {canCheckin && (
        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button className="btn sm ghost" onClick={() => modals.openCheckin(k.id)}>
            Weekly check-in
          </button>
        </div>
      )}
    </div>
  );
}

export default function Goals() {
  const { db } = useApp();
  return (
    <>
      <PageHead
        title="Goals"
        sub="Team objectives and their Key Results, with live metric progress and task completion side by side."
      />
      {db.objectives.length === 0 && <div className="empty">No objectives defined yet.</div>}
      {db.objectives.map((o) => {
        const krs = db.keyResults.filter((k) => k.objective_id === o.id);
        return (
          <div key={o.id} style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, margin: "14px 0 6px" }}>
              {o.title} <span className="muted-lbl">{o.quarter}</span>
            </h2>
            <div className="sub" style={{ marginBottom: 10 }}>
              {o.description}
            </div>
            {krs.map((k) => (
              <KRCard key={k.id} k={k} />
            ))}
          </div>
        );
      })}
    </>
  );
}
