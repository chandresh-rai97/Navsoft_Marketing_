import React, { useMemo } from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";
import { todayStr } from "../lib/format.js";

export default function MyDay() {
  const { db, me, isOverdue } = useApp();
  const modals = useModals();
  const { toggle, openTask } = useTaskHandlers();
  const today = todayStr();

  const list = useMemo(
    () =>
      db.tasks.filter(
        (x) =>
          x.assignee_user_id === me.id &&
          x.status !== "cancelled" &&
          (x.planned_for_date === today ||
            (OPEN_STATUSES.includes(x.status) && x.due_date <= today))
      ),
    [db.tasks, me.id, today]
  );

  const pinned = list
    .filter((t) => isOverdue(t) || t.status === "carried_forward")
    .sort((a, b) => b.carry_forward_count - a.carry_forward_count);
  const rest = list
    .filter((t) => !(isOverdue(t) || t.status === "carried_forward"))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const done = db.tasks.filter(
    (t) =>
      t.assignee_user_id === me.id &&
      t.status === "done" &&
      t.completed_at &&
      t.completed_at.slice(0, 10) === today
  );

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <PageHead
        title="My Day"
        sub={`Today is ${dateLabel}. Carried-forward and overdue work is pinned at the top.`}
        actions={
          <>
            <button className="btn accent" onClick={modals.openStandup}>
              Run standup
            </button>
            <button className="btn" onClick={() => modals.openTask(null)}>
              + Task
            </button>
          </>
        }
      />

      {pinned.length > 0 && (
        <div className="panel" style={{ borderColor: "#eab9b9", background: "#fdf6f6" }}>
          <h2>
            ⚠ Needs attention first <span className="muted-lbl">{pinned.length} pinned</span>
          </h2>
          {pinned.map((t) => (
            <TaskRow key={t.id} task={t} opts={{ checkable: true, pinnable: true }} onOpen={openTask} onToggle={toggle} />
          ))}
        </div>
      )}

      <div className="panel">
        <h2>
          Today <span className="muted-lbl">{rest.length} planned</span>
        </h2>
        {rest.length ? (
          rest.map((t) => (
            <TaskRow key={t.id} task={t} opts={{ checkable: true }} onOpen={openTask} onToggle={toggle} />
          ))
        ) : (
          <div className="empty">Nothing else planned. Add a task or run your standup.</div>
        )}
      </div>

      {done.length > 0 && (
        <div className="panel">
          <h2>
            Completed today <span className="muted-lbl">{done.length}</span>
          </h2>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={openTask} />
          ))}
        </div>
      )}
    </>
  );
}
