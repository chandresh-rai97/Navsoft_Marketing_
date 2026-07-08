import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow from "../components/TaskRow.jsx";

// Every task that is Done.
export default function Done() {
  const { db } = useApp();
  const { openTask } = useTaskHandlers();
  const done = db.tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

  return (
    <>
      <PageHead title="Done" sub="Every task that has been accepted and marked Done." />
      <div className="panel">
        <h2>
          Completed <span className="muted-lbl">{done.length}</span>
        </h2>
        {done.length ? (
          done.map((t) => <TaskRow key={t.id} task={t} opts={{ showAssignee: true }} onOpen={openTask} />)
        ) : (
          <div className="empty">Nothing marked Done yet.</div>
        )}
      </div>
    </>
  );
}
