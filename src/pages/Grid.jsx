import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow, { ProjectDot } from "../components/TaskRow.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";

// "Projects" — each project with its tasks (no Key Result breakdown).
export default function Grid() {
  const { db, activeProjects } = useApp();
  const { openTask } = useTaskHandlers();
  const projects = activeProjects();

  return (
    <>
      <PageHead title="Projects" sub="Each project with the tasks that belong to it." />
      {projects.length === 0 && <div className="empty">No active projects.</div>}
      {projects.map((p) => {
        const tks = db.tasks
          .filter((t) => t.project_id === p.id && t.status !== "cancelled")
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
        const open = tks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
        return (
          <div className="panel" key={p.id}>
            <h2>
              <span>
                <ProjectDot projectId={p.id} />
                {p.name}
              </span>
              <span className="muted-lbl">
                {tks.length} task{tks.length === 1 ? "" : "s"} · {open} open
              </span>
            </h2>
            {tks.length ? (
              tks.map((t) => (
                <TaskRow key={t.id} task={t} opts={{ showAssignee: true }} onOpen={openTask} />
              ))
            ) : (
              <div className="empty">No tasks in this project yet.</div>
            )}
          </div>
        );
      })}
    </>
  );
}
