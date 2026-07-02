import React from "react";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";
import { pct } from "../lib/format.js";

export default function Projects() {
  const { db, uname, KR, taskDone, isOverdue } = useApp();

  return (
    <>
      <PageHead
        title="Projects"
        sub="One row per workstream: open, overdue, blocked and done counts, plus which Key Results each project is feeding."
      />
      <div className="panel" style={{ padding: "6px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Open</th>
              <th>Overdue</th>
              <th>Blocked</th>
              <th>Done</th>
              <th>Completion</th>
              <th>Carry-fwd</th>
              <th>Feeds KRs</th>
            </tr>
          </thead>
          <tbody>
            {db.projects.map((p) => {
              const tks = db.tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
              const open = tks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
              const overdue = tks.filter((t) => isOverdue(t)).length;
              const blocked = tks.filter((t) => t.status === "blocked").length;
              const done = tks.filter(taskDone).length;
              const completion = tks.length ? done / tks.length : 0;
              const carried = tks.length ? tks.filter((t) => t.carry_forward_count > 0).length / tks.length : 0;
              const krIds = [...new Set(tks.map((t) => t.key_result_id).filter(Boolean))];
              return (
                <tr key={p.id}>
                  <td>
                    <strong>
                      <ProjectDot projectId={p.id} />
                      {p.name}
                    </strong>
                    {p.status === "archived" && <span className="tag st-cancelled"> archived</span>}
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>lead {uname(p.lead_user_id)}</div>
                  </td>
                  <td>{open}</td>
                  <td className={overdue ? "warnflag" : ""}>{overdue}</td>
                  <td className={blocked ? "warnflag" : ""}>{blocked}</td>
                  <td>{done}</td>
                  <td>{pct(completion)}%</td>
                  <td className={carried >= 0.4 ? "warnflag" : ""}>{pct(carried)}%</td>
                  <td style={{ maxWidth: 260 }}>
                    {krIds.length ? (
                      krIds.map((id) => {
                        const k = KR(id);
                        return k ? (
                          <span className="chip" key={id} style={{ marginRight: 4 }}>
                            {k.title}
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {db.projects.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty">No projects yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
