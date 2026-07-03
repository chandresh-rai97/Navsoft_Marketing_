import React from "react";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { OPEN_STATUSES, CARRY_THRESHOLD } from "../lib/logic.js";
import { pct } from "../lib/format.js";

export default function Dashboard() {
  const { db, activeUsers, taskDone, onTime, isOverdue } = useApp();

  const notCancelled = db.tasks.filter((t) => t.status !== "cancelled");
  const allTasks = notCancelled.length;
  const pending = db.tasks.filter((t) => t.status === "not_started").length;
  const overdue = db.tasks.filter((t) => isOverdue(t)).length;
  const inProgress = db.tasks.filter((t) => t.status === "in_progress").length;

  // (b) Who's lagging behind
  const members = activeUsers().filter((u) => u.role !== "viewer");
  const lagging = members
    .map((u) => {
      const mine = db.tasks.filter((t) => t.assignee_user_id === u.id);
      const od = mine.filter((t) => isOverdue(t)).length;
      const carried3 = mine.filter(
        (t) => OPEN_STATUSES.includes(t.status) && t.carry_forward_count >= CARRY_THRESHOLD
      ).length;
      const openBlockers = db.blockers.filter(
        (b) => b.raised_by_user_id === u.id && b.status === "open"
      ).length;
      const done = mine.filter(taskDone);
      const onTimePct = done.length
        ? Math.round((done.filter((t) => onTime(t)).length / done.length) * 100)
        : null;
      const lagScore =
        od * 3 + carried3 * 2 + openBlockers + (onTimePct == null ? 0 : (100 - onTimePct) / 100);
      return { u, od, carried3, openBlockers, onTimePct, lagScore };
    })
    .filter((r) => r.od > 0 || r.carried3 > 0 || r.openBlockers > 0)
    .sort((a, b) => b.lagScore - a.lagScore);

  // (c) Project completion
  const projectRows = db.projects
    .filter((p) => p.status === "active")
    .map((p) => {
      const tks = db.tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
      const done = tks.filter(taskDone).length;
      const completion = tks.length ? done / tks.length : 0;
      return { p, done, total: tks.length, completion };
    });

  const stat = (n, l, cls) => (
    <div className={"stat" + (cls ? " " + cls : "")}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );

  return (
    <>
      <PageHead
        title="Command Dashboard"
        sub="Team health, always current — rolled up from the same daily work everyone is already doing."
      />

      {/* (a) summary boxes */}
      <div className="cards">
        {stat(allTasks, "All Tasks")}
        {stat(pending, "Pending Tasks")}
        {stat(overdue, "Overdue Tasks", overdue ? "alert" : "")}
        {stat(inProgress, "In Progress Tasks")}
      </div>

      {/* (b) who's lagging behind */}
      <div className="panel" style={{ padding: "6px 10px" }}>
        <h2 style={{ padding: "10px 8px 0" }}>Who's lagging behind</h2>
        {lagging.length === 0 ? (
          <div className="empty" style={{ margin: 10 }}>Nobody's behind right now — nice.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Team member</th>
                <th>Overdue</th>
                <th>Carried 3×+</th>
                <th>Open blockers</th>
                <th>On-time %</th>
              </tr>
            </thead>
            <tbody>
              {lagging.map(({ u, od, carried3, openBlockers, onTimePct }) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td className={od ? "warnflag" : ""}>{od}</td>
                  <td className={carried3 ? "warnflag" : ""}>{carried3}</td>
                  <td className={openBlockers ? "warnflag" : ""}>{openBlockers}</td>
                  <td className={onTimePct != null && onTimePct < 60 ? "warnflag" : ""}>
                    {onTimePct == null ? "—" : onTimePct + "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* (c) project completion */}
      <div className="panel">
        <h2>Project completion</h2>
        {projectRows.length === 0 ? (
          <div className="empty">No active projects yet.</div>
        ) : (
          projectRows.map(({ p, done, total, completion }) => {
            const barCls = completion >= 0.7 ? "" : completion >= 0.4 ? "amber" : "red";
            return (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 5,
                  }}
                >
                  <span>
                    <ProjectDot projectId={p.id} />
                    {p.name}
                  </span>
                  <span>
                    {pct(completion)}%{" "}
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                      ({done}/{total})
                    </span>
                  </span>
                </div>
                <div className={"bar " + barCls}>
                  <i style={{ width: pct(completion) + "%" }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
