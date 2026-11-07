import React, { useState, useMemo, useEffect } from "react";
import TopBar from "../components/TopBar.jsx";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useDialog } from "../components/Dialog.jsx";
import PageHead from "../components/PageHead.jsx";
import MobileFilters from "../components/MobileFilters.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { ProjectDot, StatusTag } from "../components/TaskRow.jsx";
import { STATUSES, STATUS_LABEL, CARRY_THRESHOLD, MOVE_REASON_AFTER } from "../lib/logic.js";
import { fmtDate, todayStr, shiftStr } from "../lib/format.js";
import { toCSV, downloadText } from "../lib/csv.js";
import { useViewState } from "../hooks/useViewState.js";
import { useBackClose } from "../hooks/useBackClose.js";
import { useLongPress } from "../hooks/useLongPress.js";
import Sheet from "../components/Sheet.jsx";
import BulkBar from "../components/BulkBar.jsx";

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
    scopedProjects,
    reassignTasks,
    rescheduleTasks,
    deleteTask,
    deleteTasks,
  } = useApp();
  const { arg } = useNav();
  const modals = useModals();
  const dlg = useDialog();

  const [f, setF] = useViewState("alltasks.f", {
    assignee: "",
    status: "",
    project: "",
    kr: "",
    quick: "",
  });
  // A link like /tasks?quick=overdue, ?status=…, ?assignee=<id>, ?project=…
  // shows exactly that filter (e.g. from the Dashboard's numbers).
  const argKey = arg ? JSON.stringify(arg) : "";
  useEffect(() => {
    if (!arg) return;
    setF({ assignee: arg.assignee || "", status: arg.status || "", project: arg.project || "", kr: arg.kr || "", quick: arg.quick || "" });
    setDateF({ field: "due_date", op: "", v1: "", v2: "" });
    setQ("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argKey]);
  const mobile = useIsMobile();
  const longPress = useLongPress();
  const [q, setQ] = useViewState("alltasks.q", ""); // phones: search
  const [dateF, setDateF] = useViewState("alltasks.dateF", { field: "due_date", op: "", v1: "", v2: "" });
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
    const needle = mobile ? q.trim().toLowerCase() : "";
    if (needle) {
      r = r.filter((t) =>
        [t.title, t.description, uname(t.assignee_user_id), pname(t.project_id)].some((x) => (x || "").toLowerCase().includes(needle))
      );
    }
    return r.sort((a, b) => a.due_date.localeCompare(b.due_date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.tasks, f, dateF, isOverdue, q, mobile]);

  // ---- phones: filter sheet, one Date choice, groups ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openGroups, setOpenGroups] = useViewState("alltasks.openGroups", {});
  const today = todayStr();
  const weekStart = (() => { const dow = (new Date(today + "T00:00:00").getDay() + 6) % 7; return shiftStr(today, -dow); })();
  const weekEnd = shiftStr(weekStart, 6);
  const datePreset =
    !dateF.op ? "any"
      : dateF.field !== "due_date" ? "other"
      : dateF.op === "is" && dateF.v1 === today ? "today"
      : dateF.op === "between" && dateF.v1 === weekStart && dateF.v2 === weekEnd ? "week"
      : dateF.op === "before" && dateF.v1 === today ? "overdue"
      : dateF.op === "between" ? "custom" : "other";
  const pickDatePreset = (v) => {
    const d = { field: "due_date", op: "", v1: "", v2: "" };
    if (v === "today") Object.assign(d, { op: "is", v1: today });
    if (v === "week") Object.assign(d, { op: "between", v1: weekStart, v2: weekEnd });
    if (v === "overdue") Object.assign(d, { op: "before", v1: today });
    if (v === "custom") Object.assign(d, { op: "between", v1: dateF.v1 || today, v2: dateF.v2 || shiftStr(today, 7) });
    setDateF(d);
  };
  const sheetCount = [f.assignee, f.status, f.project, f.kr].filter(Boolean).length + (dateF.op ? 1 : 0);
  const DATE_LABEL = { today: "Due today", week: "Due this week", overdue: "Due before today", custom: `Due ${dateF.v1 ? fmtDate(dateF.v1) : ""}–${dateF.v2 ? fmtDate(dateF.v2) : ""}`, other: "Date filter" };
  const clearSheet = () => {
    setF((x) => ({ ...x, assignee: "", status: "", project: "", kr: "" }));
    setDateF({ field: "due_date", op: "", v1: "", v2: "" });
  };
  // Phone order: Overdue, Due soon (7 days), In progress, Later, then Done and
  // Cancelled collapsed at the end. (Desktop keeps its due-date order.)
  const GROUPS = [
    ["overdue", "Overdue"],
    ["soon", "Due soon"],
    ["progress", "In progress"],
    ["later", "Later"],
    ["done", "Done"],
    ["cancelled", "Cancelled"],
  ];
  const groupOf = (t) =>
    t.status === "done" ? "done"
      : t.status === "cancelled" ? "cancelled"
      : isOverdue(t) ? "overdue"
      : t.status === "in_progress" ? "progress"
      : t.due_date && t.due_date <= shiftStr(today, 7) ? "soon"
      : "later";
  const grouped = useMemo(() => {
    const g = Object.fromEntries(GROUPS.map(([k]) => [k, []]));
    if (mobile) rows.forEach((t) => g[groupOf(t)].push(t));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mobile]);
  const groupOpen = (k) => (k in openGroups ? openGroups[k] : k !== "done" && k !== "cancelled");

  const canBulk = isManager();
  // Phones: select mode, bulk-action sheets and paging (100 rows at a time).
  const PAGE = 100;
  const [selecting, setSelecting] = useState(false);
  const [bulkSheet, setBulkSheet] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const exitSelect = () => {
    setSelecting(false);
    setSel({});
  };
  useEffect(() => {
    if (!mobile || !selecting) return undefined;
    document.documentElement.classList.add("select-mode");
    return () => document.documentElement.classList.remove("select-mode");
  }, [mobile, selecting]);
  useBackClose(mobile && selecting, exitSelect);
  useEffect(() => setShown(PAGE), [f, dateF]);
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
      setSelecting(false);
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
            <button className="btn ghost hide-phone" onClick={downloadCsv}>
              Download CSV
            </button>
          )
        }
      />

      <TopBar
        menu={[
          canBulk && { label: selecting ? "Stop selecting" : "Select tasks", onClick: () => (selecting ? exitSelect() : setSelecting(true)) },
          canBulk && selecting && { label: `Select all ${rows.length}`, onClick: () => setSel(Object.fromEntries(rows.map((t) => [t.id, true]))) },
          isAdmin() && { label: "Download CSV", onClick: downloadCsv },
        ]}
      />
      {!mobile && (
      <MobileFilters
        count={Object.values(f).filter(Boolean).length + (dateF.op ? 1 : 0)}
        chips={[
          f.assignee && { label: uname(f.assignee), clear: () => set("assignee", "") },
          f.status && { label: STATUS_LABEL[f.status] || f.status, clear: () => set("status", "") },
          f.project && { label: pname(f.project), clear: () => set("project", "") },
          f.kr && { label: "KR: " + (db.keyResults.find((k) => k.id === f.kr)?.title || "…"), clear: () => set("kr", "") },
          f.quick && { label: { overdue: "Overdue", blocked: "Blocked", carried: "Pushed 3+ times" }[f.quick], clear: () => set("quick", "") },
          dateF.op && { label: "Date filter", clear: () => setDateF({ field: dateF.field, op: "", v1: "", v2: "" }) },
        ]}
      >
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
            {scopedProjects().map((p) => (
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
            {[["", "All"], ["overdue", "Overdue"], ["blocked", "Blocked"], ["carried", "Pushed 3+"]].map(
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
      </MobileFilters>
      )}

      {mobile && (
        <div className="at-top">
          <div className="at-search">
            <label className="sr-only" htmlFor="at-q">Search tasks</label>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input id="at-q" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="Search tasks, people, projects" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="chiprow" aria-label="Filters">
            <li>
              <button type="button" className={"fchip" + (sheetCount ? " on" : "")} aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                Filters{sheetCount ? ` (${sheetCount})` : ""}
              </button>
            </li>
            {[["overdue", "Overdue"], ["blocked", "Blocked"], ["carried", "Pushed 3+"]].map(([k, l]) => (
              <li key={k}>
                <button type="button" className={"fchip" + (f.quick === k ? " on" : "")} aria-pressed={f.quick === k} onClick={() => set("quick", f.quick === k ? "" : k)}>
                  {l}
                </button>
              </li>
            ))}
            {[
              f.assignee && { label: uname(f.assignee), clear: () => set("assignee", "") },
              f.status && { label: STATUS_LABEL[f.status] || f.status, clear: () => set("status", "") },
              f.project && { label: pname(f.project), clear: () => set("project", "") },
              f.kr && { label: db.keyResults.find((k) => k.id === f.kr)?.title || "Key result", clear: () => set("kr", "") },
              dateF.op && { label: DATE_LABEL[datePreset] || "Date filter", clear: () => setDateF({ field: "due_date", op: "", v1: "", v2: "" }) },
            ]
              .filter(Boolean)
              .map((c) => (
                <li key={c.label}>
                  <button type="button" className="fchip on removable" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                    <span>{c.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </li>
              ))}
          </ul>
          <div className="at-count" role="status" aria-live="polite">
            {rows.length} {rows.length === 1 ? "task" : "tasks"}
          </div>
        </div>
      )}
      {mobile && sheetOpen && (
        <Sheet
          title="Filters"
          onClose={() => setSheetOpen(false)}
          footer={
            <div className="sheet-foot-row">
              <button type="button" className="textbtn" onClick={clearSheet} disabled={!sheetCount}>Clear all</button>
              <button type="button" className="btn" onClick={() => setSheetOpen(false)}>
                Show {rows.length} {rows.length === 1 ? "task" : "tasks"}
              </button>
            </div>
          }
        >
          <div className="field">
            <label htmlFor="atf-person">Person</label>
            <select id="atf-person" value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
              <option value="">Anyone</option>
              {activeUsers().map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="atf-status">Status</label>
            <select id="atf-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map((x) => (<option key={x} value={x}>{STATUS_LABEL[x]}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="atf-project">Project</label>
            <select id="atf-project" value={f.project} onChange={(e) => set("project", e.target.value)}>
              <option value="">Any project</option>
              {scopedProjects().map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="atf-kr">Key result</label>
            <select id="atf-kr" value={f.kr} onChange={(e) => set("kr", e.target.value)}>
              <option value="">Any key result</option>
              {db.keyResults.map((k) => (<option key={k.id} value={k.id}>{k.title}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="atf-date">Date</label>
            <select id="atf-date" value={datePreset} onChange={(e) => pickDatePreset(e.target.value)}>
              <option value="any">Any date</option>
              <option value="today">Due today</option>
              <option value="week">Due this week</option>
              <option value="overdue">Due before today</option>
              <option value="custom">Custom range</option>
              {datePreset === "other" && <option value="other">Set on desktop</option>}
            </select>
          </div>
          {datePreset === "custom" && (
            <div className="row2">
              <div className="field">
                <label htmlFor="atf-from">From</label>
                <input id="atf-from" type="date" value={dateF.v1} onChange={(e) => setD("v1", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="atf-to">To</label>
                <input id="atf-to" type="date" value={dateF.v2} onChange={(e) => setD("v2", e.target.value)} />
              </div>
            </div>
          )}
        </Sheet>
      )}
      {canBulk && !mobile && selectedIds.length > 0 && (
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
              style={{ background: "var(--danger-solid)" }}
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
      ) : mobile ? (
        // Phones: grouped list — Overdue, Due soon, In progress, Later, then Done
        // and Cancelled (collapsed). Tap a task to open it; in select mode a tap
        // selects it. Long-press a task to start selecting.
        <>
          {(() => {
            let budget = shown;
            return GROUPS.filter(([k]) => grouped[k].length).map(([k, label]) => {
              const list = grouped[k];
              const isOpen = groupOpen(k);
              const visible = isOpen ? list.slice(0, Math.max(0, budget)) : [];
              if (isOpen) budget -= visible.length;
              return (
                <section key={k} className="at-group" aria-labelledby={"atg-" + k}>
                  <h2 className="at-group-h" id={"atg-" + k}>
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpenGroups((o) => ({ ...o, [k]: !isOpen }))}>
                      <span>{label}</span>
                      <span className="at-group-n">{list.length}</span>
                      <svg className="at-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </h2>
                  {visible.length > 0 && (
                    <div className="mcards" role="list">
                      {visible.map((t) => {
                        const od = isOverdue(t);
                        return (
                          <div
                            key={t.id}
                            role="listitem"
                            className={"mcard" + (selecting ? " selecting" : "") + (sel[t.id] ? " on" : "")}
                            {...longPress(() => { setSelecting(true); setSel((x) => ({ ...x, [t.id]: true })); })}
                          >
                            {selecting && (
                              <label className="mcard-check">
                                <input type="checkbox" aria-label={"Select " + t.title} checked={!!sel[t.id]}
                                  onChange={(e) => setSel((x) => ({ ...x, [t.id]: e.target.checked }))} />
                              </label>
                            )}
                            <div className="mcard-main">
                              <button type="button" className="mcard-title"
                                onClick={() => (selecting ? setSel((x) => ({ ...x, [t.id]: !x[t.id] })) : modals.openTask(t.id))}>
                                {t.title}
                              </button>
                              <div className="mcard-meta">
                                <div className="mm-line">
                                  <span className={"mm-due" + (od ? " warnflag" : "")}>{od ? "Overdue · " : "Due "}{fmtDate(t.due_date)}</span>
                                  <span className="mm-ell">{uname(t.assignee_user_id)}</span>
                                </div>
                                <div className="mm-line">
                                  <span className="mm-ell"><ProjectDot projectId={t.project_id} />{pname(t.project_id)}</span>
                                  <StatusTag status={t.status} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            });
          })()}
          {rows.length > shown && (
            <button type="button" className="btn ghost at-more" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more ({rows.length - shown} left)
            </button>
          )}
          {selecting && (
            <BulkBar
              count={selectedIds.length}
              onExit={exitSelect}
              onReassign={() => setBulkSheet("reassign")}
              onReschedule={() => setBulkSheet("reschedule")}
              onDelete={isAdmin() ? handleBulkDelete : null}
            />
          )}
          {bulkSheet === "reassign" && (
            <Sheet
              title={`Reassign ${selectedIds.length} task${selectedIds.length === 1 ? "" : "s"}`}
              onClose={() => setBulkSheet(null)}
              footer={
                <button type="button" className="btn" disabled={!bulkUser} onClick={async () => {
                  await reassignTasks(selectedIds, bulkUser); setBulkUser(""); setBulkSheet(null); exitSelect();
                }}>Reassign</button>
              }
            >
              <div className="field">
                <label htmlFor="at-bulk-user">New owner</label>
                <select id="at-bulk-user" value={bulkUser} onChange={(e) => setBulkUser(e.target.value)}>
                  <option value="">Choose a person…</option>
                  {activeUsers().map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </Sheet>
          )}
          {bulkSheet === "reschedule" && (
            <Sheet
              title={`Reschedule ${selectedIds.length} task${selectedIds.length === 1 ? "" : "s"}`}
              onClose={() => setBulkSheet(null)}
              footer={
                <button type="button" className="btn" disabled={!bulkDate} onClick={async () => {
                  await rescheduleTasks(selectedIds, bulkDate); setBulkSheet(null); exitSelect();
                }}>Reschedule</button>
              }
            >
              <div className="field">
                <label htmlFor="at-bulk-date">New due date</label>
                <input id="at-bulk-date" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </div>
            </Sheet>
          )}
        </>
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
                        style={{ color: "var(--red)", borderColor: "var(--red-border)" }}
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
