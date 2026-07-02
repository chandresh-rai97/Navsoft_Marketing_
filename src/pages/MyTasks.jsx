import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useTaskHandlers } from "../hooks/useTaskHandlers.js";
import PageHead from "../components/PageHead.jsx";
import TaskRow from "../components/TaskRow.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";
import { todayStr, shiftStr } from "../lib/format.js";

const FILTERS = [
  ["today", "Today"],
  ["week", "This week"],
  ["overdue", "Overdue"],
  ["upcoming", "Upcoming"],
  ["done", "Done"],
  ["all", "All"],
];

export default function MyTasks() {
  const { db, me, pname, KR, isOverdue } = useApp();
  const modals = useModals();
  const { toggle, openTask } = useTaskHandlers();
  const [filter, setFilter] = useState("today");
  const [group, setGroup] = useState("none");
  const t = todayStr();

  const rows = useMemo(() => {
    const mine = db.tasks.filter((x) => x.assignee_user_id === me.id);
    const inWeek = (x) => x.due_date >= t && x.due_date <= shiftStr(t, 7);
    const byFilter = {
      today: (x) => x.planned_for_date === t || x.due_date === t,
      week: inWeek,
      overdue: (x) => isOverdue(x),
      upcoming: (x) => x.due_date > t && OPEN_STATUSES.includes(x.status),
      done: (x) => x.status === "done",
      all: () => true,
    };
    return mine
      .filter(byFilter[filter])
      .filter((x) => filter === "done" || x.status !== "cancelled")
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [db.tasks, me.id, filter, t, isOverdue]);

  const grouped = useMemo(() => {
    if (group === "none") return null;
    const keyOf =
      group === "project"
        ? (x) => pname(x.project_id)
        : (x) => KR(x.key_result_id)?.title || "No KR";
    const g = {};
    rows.forEach((r) => {
      const k = keyOf(r);
      (g[k] = g[k] || []).push(r);
    });
    return g;
  }, [rows, group, pname, KR]);

  return (
    <>
      <PageHead
        title="My Tasks"
        sub="Everything assigned to you. Filter by time, group by project or Key Result."
        actions={
          <button className="btn" onClick={() => modals.openTask(null)}>
            + Task
          </button>
        }
      />
      <div className="filters">
        <div className="seg">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
          <option value="kr">Group by Key Result</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No tasks for this filter.</div>
      ) : grouped ? (
        Object.keys(grouped)
          .sort()
          .map((g) => (
            <div className="panel" key={g}>
              <h2>
                {g} <span className="muted-lbl">{grouped[g].length}</span>
              </h2>
              {grouped[g].map((task) => (
                <TaskRow key={task.id} task={task} opts={{ checkable: true }} onOpen={openTask} onToggle={toggle} />
              ))}
            </div>
          ))
      ) : (
        <div className="panel">
          {rows.map((task) => (
            <TaskRow key={task.id} task={task} opts={{ checkable: true }} onOpen={openTask} onToggle={toggle} />
          ))}
        </div>
      )}
    </>
  );
}
