import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { CARRY_THRESHOLD, CONF_LABEL } from "../lib/logic.js";
import { pct } from "../lib/format.js";

const confColor = (c) => (c === "on_track" ? "var(--green)" : c === "at_risk" ? "var(--amber)" : "var(--red)");

export default function OKRTree() {
  const { db, uname, krProgress, krTasks, taskDone, isOverdue } = useApp();
  const { arg } = useNav();
  const { openTask } = useTaskHandlers();
  const [openKr, setOpenKr] = useState(arg || null);

  // Follow drill-in navigation from the dashboard heatmap / attention feed.
  useEffect(() => {
    if (arg) setOpenKr(arg);
  }, [arg]);

  return (
    <>
      <PageHead
        title="OKR Tree"
        sub="Objectives → Key Results → the tasks underneath. Drill from a red KR straight to the work that's stuck."
      />
      {db.objectives.length === 0 && <div className="empty">No OKRs yet.</div>}
      {db.objectives.map((o) => (
        <div className="panel" key={o.id}>
          <h2>
            {o.title}{" "}
            <span className="muted-lbl">
              {o.quarter} · owner {uname(o.owner_user_id)}
            </span>
          </h2>
          {db.keyResults
            .filter((k) => k.objective_id === o.id)
            .map((k) => {
              const prog = krProgress(k);
              const tasks = krTasks(k.id);
              const done = tasks.filter(taskDone).length;
              const stuck = tasks.filter(
                (t) => isOverdue(t) || t.status === "blocked" || t.carry_forward_count >= CARRY_THRESHOLD
              );
              const isOpen = openKr === k.id;
              const barCls = prog >= 0.7 ? "" : prog >= 0.4 ? "amber" : "red";
              return (
                <div
                  key={k.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderLeft: `4px solid ${confColor(k.confidence)}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 10,
                  }}
                >
                  <div
                    className="pointer"
                    onClick={() => setOpenKr(isOpen ? null : k.id)}
                    style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{k.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                        {k.current_value}/{k.target_value} {k.metric_unit} · {done}/{tasks.length} tasks done ·{" "}
                        <span className={"conf-" + k.confidence}>{CONF_LABEL[k.confidence]}</span>
                        {stuck.length > 0 && <span className="warnflag"> · {stuck.length} stuck</span>}
                      </div>
                    </div>
                    <div style={{ width: 120 }}>
                      <div className={"bar " + barCls}>
                        <i style={{ width: pct(prog) + "%" }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                        {pct(prog)}%
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 11 }}>
                      {tasks.length ? (
                        [...tasks]
                          .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)))
                          .map((t) => <TaskRow key={t.id} task={t} opts={{ showAssignee: true }} onOpen={openTask} />)
                      ) : (
                        <div className="empty">No tasks under this KR yet.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </>
  );
}
