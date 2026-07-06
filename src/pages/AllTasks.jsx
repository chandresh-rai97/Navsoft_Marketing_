import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useDialog } from "../components/Dialog.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot, StatusTag } from "../components/TaskRow.jsx";
import { STATUSES, STATUS_LABEL, CARRY_THRESHOLD, MOVE_REASON_AFTER } from "../lib/logic.js";
import { fmtDate, todayStr, shiftStr } from "../lib/format.js";
import { toCSV, downloadText } from "../lib/csv.js";

// Which date column to filter on.
const DATE_FIELDS = [
  ["due_date", "Due date"],
  ["planned_for_date", "Start date"],
  ["original_due_date", "Original due date"],
  ["created_at", "Created date"],
  ["completed_at", "Completed date"],
];

// HubSpot-style operators.
const DATE_OPS = [
  ["is", "is"],
  ["is_not", "is not"],
  ["before", "is before"],
  ["after", "is after"],
  ["between", "is between"],
  ["on_or_before", "is on or before"],
  ["on_or_after", "is on or after"],
  ["last_n", "is in the last N days"],
  ["next_n", "is in the next N days"],
  ["more_than_n_ago", "is more than N days ago"],
  ["known", "is known"],
  ["unknown", "is unknown"],
];

const NEEDS_DATE = ["is", "is_not", "before", "after", "on_or_before", "on_or_after", "between"];
const NEEDS_NUM = ["last_n", "next_n", "more_than_n_ago"];

export default function AllTasks() {
  const {
    db,
    uname,
    pname,
    activeUsers,
    isOverdue,
    isAdmin,
    isManager,
    reassignTasks,
    rescheduleTasks,
    deleteTask,
    deleteTasks,
  } = useApp();
  const { arg } = useNav();
  const modals = useModals();
  const dlg = useDialog();

  const [f, setF] = useState({
    assignee: "",
    status: "",
    project: arg?.project || "",
    kr: arg?.kr || "",
    quick: "",
  });
  const [dateF, setDateF] = useState({ field: "due_date", op: "", v1: "", v2: "" });
  const [sel, setSel] = useState({});
  const [bulkUser, setBulkUser] = useState("");
  const [bulkDate, setBulkDate] = useState(todayStr());

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setD = (k, v) => setDateF((x) => ({ ...x, [k]: v }));

  // Is the date filter fully specified enough to apply?
  const dateActive =
    dateF.op &&
    (["known", "unknown"].includes(dateF.op) ||
      (NEEDS_NUM.includes(dateF.op) && dateF.v1 !== "") ||
      (dateF.op === "between" && dateF.v1 && dateF.v2) ||
      (NEEDS_DATE.includes(dateF.op) && dateF.op !== "between" && dateF.v1));

  function matchesDate(t) {
    if (!dateActive) return true;
    const raw = t[dateF.field];
    const d = raw ? String(raw).slice(0, 10) : null; // dates + timestamps → YYYY-MM-DD
    const today = todayStr();
    switch (dateF.op) {
      case "is": return d === dateF.v1;
      case "is_not": return d !== dateF.v1;
      case "before": return !!d && d < dateF.v1;
      case "after": return !!d && d > dateF.v1;
      case "on_or_before": return !!d && d <= dateF.v1;
      case "on_or_after": return !!d && d >= dateF.v1;
      case "between": return !!d && d >= dateF.v1 && d <= dateF.v2;
      case "last_n": return !!d && d >= shiftStr(today, -Number(dateF.v1)) && d <= today;
      case "next_n": return !!d && d >= today && d <= shiftStr(today, Number(dateF.v1));
      case "more_than_n_ago": return !!d && d < shiftStr(today, -Number(dateF.v1));
      case "known": return !!d;
      case "unknown": return !d;
      default: return true;
    }
  }

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
    r = r.filter(matchesDate);
    return r.sort((a, b) => a.due_date.localeCompare(b.due_date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.tasks, f, dateF, isOverdue]);

  const canBulk = isManager();
  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const allChecked = rows.length > 0 && rows.every((t) => sel[t.id]);

  const flagsText = (t) =>
    [
      isOverdue(t) ? "overdue" : "",
      t.carry_forward_count >= CARRY_THRESHOLD ? `carried ${t.carry_forward_count}x` : "",
      t.due_date_change_count >= MOVE_REASON_AFTER ? `moved ${t.due_date_change_count}x` : "",
    ]
      .filter(Boolean)
      .join("; ");

  function downloadCsv() {
    const headers = ["Task", "Owner", "Project", "Status", "Due", "Flags"];
    const data = rows.map((t) => [
      t.title,
      uname(t.assignee_user_id),
      pname(t.project_id),
      STATUS_LABEL[t.status] || t.status,
      t.due_date,
      flagsText(t),
    ]);
    downloadText(`all-tasks-${todayStr()}.csv`, toCSV(headers, data));
  }

  async function handleDelete(t) {
    const ok = await dlg.confirm(`Delete "${t.title}" permanently? This can't be undone.`);
    if (!ok) return;
    try {
      await deleteTask(t.id);
    } catch (e) {
      dlg.alert("Couldn't delete: " + (e.message || e));
    }
  }

  async function handleBulkDelete() {
    const n = selectedIds.length;
    const ok = await dlg.confirm(
      `Delete ${n} selected task${n === 1 ? "" : "s"} permanently? This can't be undone.`
    );
    if (!ok) return;
    try {
      await deleteTasks(selectedIds);
      setSel({});
    } catch (e) {
      dlg.alert("Couldn't delete: " + (e.message || e));
    }
  }

  return (
    <>
      <PageHead
        title="All Tasks"
        sub="Every task across every person. Filter, then open any task to edit, reschedule, or reassign."
        actions={
          isAdmin() && (
            <button className="btn ghost" onClick={downloadCsv}>
              Download CSV
            </button>
          )
        }
      />

      <div className="filters">
        <select value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
          <option value="">All people</option>
          {activeUsers().map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select value={f.project} onChange={(e) => set("project", e.target.value)}>
          <option value="">All projects</option>
          {db.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={f.kr} onChange={(e) => set("kr", e.target.value)}>
          <option value="">All KRs</option>
          {db.keyResults.map((k) => (
            <option key={k.id} value={k.id}>{k.title}</option>
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

      {/* Date filter builder */}
      <div className="filters" style={{ marginTop: -6 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Date filter:</span>
        <select value={dateF.field} onChange={(e) => setD("field", e.target.value)}>
          {DATE_FIELDS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select value={dateF.op} onChange={(e) => setD("op", e.target.value)}>
          <option value="">— no date filter —</option>
          {DATE_OPS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        {NEEDS_DATE.includes(dateF.op) && (
          <input type="date" value={dateF.v1} onChange={(e) => setD("v1", e.target.value)} />
        )}
        {dateF.op === "between" && (
          <>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>and</span>
            <input type="date" value={dateF.v2} onChange={(e) => setD("v2", e.target.value)} />
          </>
        )}
        {NEEDS_NUM.includes(dateF.op) && (
          <input
            type="number"
            min="0"
            placeholder="days"
            style={{ width: 90 }}
            value={dateF.v1}
            onChange={(e) => setD("v1", e.target.value)}
          />
        )}
        {dateF.op && (
          <button className="btn sm ghost" onClick={() => setDateF({ field: dateF.field, op: "", v1: "", v2: "" })}>
            Clear
          </button>
        )}
      </div>

      {canBulk && selectedIds.length > 0 && (
        <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>{selectedIds.length} selected</strong>
          <select value={bulkUser} onChange={(e) => setBulkUser(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7 }}>
            <option value="">Reassign to…</option>
            {activeUsers().map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button className="btn sm" disabled={!bulkUser} onClick={async () => { await reassignTasks(selectedIds, bulkUser); setSel({}); setBulkUser(""); }}>
            Reassign
          </button>
          <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7 }} />
          <button className="btn sm ghost" onClick={async () => { await rescheduleTasks(selectedIds, bulkDate); setSel({}); }}>
            Reschedule
          </button>
          {isAdmin() && (
            <button
              className="btn sm"
              style={{ background: "var(--red)" }}
              onClick={handleBulkDelete}
            >
              Delete selected ({selectedIds.length})
            </button>
          )}
          <button className="btn sm ghost" onClick={() => setSel({})}>Clear</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">No tasks match.</div>
      ) : (
        <div className="panel" style={{ padding: "6px 10px" }}>
          <table>
            <thead>
              <tr>
                {canBulk && (
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
                )}
                <th>Task</th>
                <th>Owner</th>
                <th>Project</th>
                <th>Status</th>
                <th>Due</th>
                <th>Flags</th>
                {isAdmin() && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="clk">
                  {canBulk && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!sel[t.id]}
                        onChange={(e) => setSel((s) => ({ ...s, [t.id]: e.target.checked }))}
                      />
                    </td>
                  )}
                  <td onClick={() => modals.openTask(t.id)}><strong>{t.title}</strong></td>
                  <td onClick={() => modals.openTask(t.id)}>{uname(t.assignee_user_id)}</td>
                  <td onClick={() => modals.openTask(t.id)}>
                    <ProjectDot projectId={t.project_id} />
                    {pname(t.project_id)}
                  </td>
                  <td onClick={() => modals.openTask(t.id)}><StatusTag status={t.status} /></td>
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
                  {isAdmin() && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn sm ghost"
                        style={{ color: "var(--red)", borderColor: "#eab9b9" }}
                        onClick={() => handleDelete(t)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
