import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";
import { pct } from "../lib/format.js";

export default function Grid() {
  const { db, krProgress, taskDone, isOverdue, activeProjects } = useApp();
  const { navigate } = useNav();
  const krs = db.keyResults;
  const projects = activeProjects();

  function Cell({ pid, kid }) {
    const tks = db.tasks.filter(
      (t) =>
        t.project_id === pid &&
        (kid ? t.key_result_id === kid : !t.key_result_id) &&
        t.status !== "cancelled"
    );
    if (!tks.length) return <td className="cell" style={{ color: "var(--muted)" }}>·</td>;
    const open = tks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    const done = tks.filter(taskDone).length;
    const hot = tks.some((t) => isOverdue(t) || t.status === "blocked");
    return (
      <td
        className={"cell pointer" + (hot ? " hot" : "")}
        onClick={() => navigate("alltasks", { project: pid, kr: kid || "" })}
      >
        <span className="c-open">{open}</span>
        <div className="c-sub">{done} done</div>
      </td>
    );
  }

  return (
    <>
      <PageHead
        title="Project × KR Grid"
        sub="The model, literally: projects are rows, Key Results are columns, each cell is the work in that intersection. Read a row to judge a workstream, a column to judge a goal."
      />
      <div className="panel matrix">
        <table>
          <thead>
            <tr>
              <th className="corner"> </th>
              {krs.map((k) => (
                <th className="colh" key={k.id}>
                  {k.title}
                  <div style={{ fontWeight: 400, color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>
                    {pct(krProgress(k))}%
                  </div>
                </th>
              ))}
              <th className="colh">— none —</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="rowh">
                  <ProjectDot projectId={p.id} />
                  {p.name}
                </td>
                {krs.map((k) => (
                  <Cell key={k.id} pid={p.id} kid={k.id} />
                ))}
                <Cell pid={p.id} kid={null} />
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={krs.length + 2}>
                  <div className="empty">No active projects.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          Each cell shows <strong>open</strong> / done tasks in that project × KR intersection. Red cells have
          overdue or blocked work.
        </div>
      </div>
    </>
  );
}
