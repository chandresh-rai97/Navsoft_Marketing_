import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot, StatusTag } from "../components/TaskRow.jsx";
import { STATUSES, STATUS_LABEL, CARRY_THRESHOLD, MOVE_REASON_AFTER } from "../lib/logic.js";
import { fmtDate, todayStr } from "../lib/format.js";

export default function AllTasks() {
  const { db, uname, pname, activeUsers, isOverdue, reassignTasks, rescheduleTasks } = useApp();
  const { arg } = useNav();
  const modals = useModals();

  const [f, setF] = useState({
    assignee: "",
    status: "",
    project: arg?.project || "",
    kr: arg?.kr || "",
    quick: "",
  });
  const [sel, setSel] = useState({});
  const [bulkUser, setBulkUser] = useState("");
  const [bulkDate, setBulkDate] = useState(todayStr());

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const rows = useMemo(() => {
    let r = db.tasks.filter(
      (t) =>
        (!f.assignee || t.assignee_user_id === f.assignee) &&
        (!f.status || t.status === f.status) &&
        (!f.project || t.project_id === f.project) &&
        (!f.kr || t.key_result_id === f.kr)
    );
    if (f.quick === "overdue") r = r.filter((t) => isOverdue(t));
    if (f.quick === "blocked") r = r.filter((t) => t.status === "blocked");
    if (f.quick === "carried") r = r.filter((t) => t.carry_forward_count >= CARRY_THRESHOLD);
    return r.sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [db.tasks, f, isOverdue]);

  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const allChecked = rows.length > 0 && rows.every((t) => sel[t.id]);

  return (
    <>
      <PageHead
        title="All Tasks"
        sub="Every task across every person. Filter, then open any task to edit, reschedule, or reassign."
      />
      <div className="filters">
        <select value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
          <option value="">All people</option>
          {activeUsers().map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={f.project} onChange={(e) => set("project", e.target.value)}>
          <option value="">All projects</option>
          {db.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={f.kr} onChange={(e) => set("kr", e.target.value)}>
          <option value="">All KRs</option>
          {db.keyResults.map((k) => (
            <option key={k.id} value={k.id}>
              {k.title}
            </option>
          ))}
        </select>
        <div className="seg">
          {[["", "All"], ["overdue", "Overdue"], ["blocked", "Blocked"], ["carried", "Pushed 3+×"]].map(
            ([k, l]) => (
              <button key={k} className={f.quick === k ? "on" : ""} onClick={() => set("quick", k)}>
                {l}
              </button>
            )
          )}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>{selectedIds.length} selected</strong>
          <select value={bulkUser} onChange={(e) => setBulkUser(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7 }}>
            <option value="">Reassign to…</option>
            {activeUsers().map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            className="btn sm"
            disabled={!bulkUser}
            onClick={async () => {
              await reassignTasks(selectedIds, bulkUser);
              setSel({});
              setBulkUser("");
            }}
          >
            Reassign
          </button>
          <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7 }} />
          <button
            className="btn sm ghost"
            onClick={async () => {
              await rescheduleTasks(selectedIds, bulkDate);
              setSel({});
            }}
          >
            Reschedule
          </button>
          <button className="btn sm ghost" onClick={() => setSel({})}>
            Clear
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">No tasks match.</div>
      ) : (
        <div className="panel" style={{ padding: "6px 10px" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => {
                      const next = {};
                      if (e.target.checked) rows.forEach((t) => (next[t.id] = true));
                      setSel(next);
                    }}
                  />
                </th>
                <th>Task</th>
                <th>Owner</th>
                <th>Project</th>
                <th>Status</th>
                <th>Due</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="clk">
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!sel[t.id]}
                      onChange={(e) => setSel((s) => ({ ...s, [t.id]: e.target.checked }))}
                    />
                  </td>
                  <td onClick={() => modals.openTask(t.id)}>
                    <strong>{t.title}</strong>
                  </td>
                  <td onClick={() => modals.openTask(t.id)}>{uname(t.assignee_user_id)}</td>
                  <td onClick={() => modals.openTask(t.id)}>
                    <ProjectDot projectId={t.project_id} />
                    {pname(t.project_id)}
                  </td>
                  <td onClick={() => modals.openTask(t.id)}>
                    <StatusTag status={t.status} />
                  </td>
                  <td onClick={() => modals.openTask(t.id)}>{fmtDate(t.due_date)}</td>
                  <td onClick={() => modals.openTask(t.id)}>
                    {isOverdue(t) && <span className="warnflag">overdue </span>}
                    {t.carry_forward_count >= CARRY_THRESHOLD && (
                      <span className="warnflag">↻{t.carry_forward_count} </span>
                    )}
                    {t.due_date_change_count >= MOVE_REASON_AFTER && (
                      <span className="movedflag">moved{t.due_date_change_count}×</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
