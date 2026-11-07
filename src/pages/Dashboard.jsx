import React from "react";
import RowTable from "../components/RowTable.jsx";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { OPEN_STATUSES, CARRY_THRESHOLD } from "../lib/logic.js";
import { pct, todayStr, shiftStr } from "../lib/format.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useNav } from "../context/Nav.jsx";
import { useViewState } from "../hooks/useViewState.js";

export default function Dashboard() {
  const { db, activeUsers, taskDone, onTime, isOverdue, scopedProjects } = useApp();
  const mobile = useIsMobile();
  const { navigate } = useNav();
  const [period, setPeriod] = useViewState("dashboard.period", "week");

  // db.tasks is already scoped by RLS (a manager only receives their own
  // project's tasks), so every count here reflects just what they manage.
  const notCancelled = db.tasks.filter((t) => t.status !== "cancelled");
  const allTasks = notCancelled.length;
  const pending = db.tasks.filter((t) => t.status === "not_started").length;
  const overdue = db.tasks.filter((t) => isOverdue(t)).length;
  const inProgress = db.tasks.filter((t) => t.status === "in_progress").length;

  // (b) Who's lagging behind — only people who appear on visible tasks.
  const assigneeIds = new Set(db.tasks.map((t) => t.assignee_user_id));
  const members = activeUsers().filter((u) => u.role !== "viewer" && assigneeIds.has(u.id));
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

  // (c) Project completion — only the projects this user is responsible for.
  const projectRows = scopedProjects()
    .map((p) => {
      const tks = db.tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
      const done = tks.filter(taskDone).length;
      const completion = tks.length ? done / tks.length : 0;
      return { p, done, total: tks.length, completion };
    });

  // ---------------- Phones: a different, task-first layout ----------------
  if (mobile) {
    const today = todayStr();
    const range = (p, back = 0) => {
      if (p === "today") { const d = shiftStr(today, -back); return [d, d]; }
      if (p === "week") {
        const dow = (new Date(today + "T00:00:00").getDay() + 6) % 7;
        const start = shiftStr(today, -dow - 7 * back);
        return [start, shiftStr(start, 6)];
      }
      const [y, m] = today.split("-").map(Number);
      const first = new Date(y, m - 1 - back, 1);
      const last = new Date(y, m - back, 0);
      const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return [f(first), f(last)];
    };
    const PERIODS = [["today", "Today"], ["week", "This week"], ["month", "This month"]];
    const PREV = { today: "yesterday", week: "last week", month: "last month" };
    const [from, to] = range(period);
    const [pFrom, pTo] = range(period, 1);
    const inR = (d, a, b) => !!d && d >= a && d <= b;

    // Needs attention: right now, whatever the period.
    const nOverdue = db.tasks.filter((t) => isOverdue(t)).length;
    const nAwaiting = db.tasks.filter((t) => t.status === "done_pending_acceptance").length;
    const nBlocked = db.tasks.filter((t) => t.status === "blocked").length;

    // Team on-time %: tasks finished in the period that met their original date.
    const onTimeIn = (a, b) => {
      const fin = db.tasks.filter((t) => taskDone(t) && inR((t.completed_at || "").slice(0, 10), a, b));
      return fin.length ? { pct: Math.round((fin.filter((t) => onTime(t)).length / fin.length) * 100), n: fin.length } : null;
    };
    const cur = onTimeIn(from, to);
    const prev = onTimeIn(pFrom, pTo);
    const delta = cur && prev ? cur.pct - prev.pct : null;

    // Status mix: tasks due in the period.
    const due = db.tasks.filter((t) => t.status !== "cancelled" && inR(t.due_date, from, to));
    const mix = { overdue: 0, progress: 0, pending: 0, done: 0 };
    due.forEach((t) => {
      if (taskDone(t)) mix.done++;
      else if (isOverdue(t)) mix.overdue++;
      else if (t.status === "in_progress") mix.progress++;
      else mix.pending++;
    });
    const MIX = [
      ["done", "Done", "var(--accent)"],
      ["progress", "In progress", "var(--navai-light-blue)"],
      ["pending", "Pending", "var(--neutral-soft)"],
      ["overdue", "Overdue", "var(--danger-solid)"],
    ];
    const periodWord = PERIODS.find(([k]) => k === period)[1].toLowerCase();

    const attn = [
      ["Overdue", nOverdue, { quick: "overdue" }, true],
      ["Awaiting acceptance", nAwaiting, { status: "done_pending_acceptance" }, false],
      ["Blocked", nBlocked, { quick: "blocked" }, true],
    ];

    return (
      <div className="pd">
        <PageHead title="Command Dashboard" />
        <div className="seg pd-period" role="group" aria-label="Period">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" className={period === k ? "on" : ""} aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>

        <section className="pd-sec" aria-labelledby="pd-attn">
          <h2 id="pd-attn" className="pd-h">Needs attention</h2>
          <div className="pd-attn">
            {attn.map(([label, n, arg, warn]) => (
              <button key={label} type="button" className={"pd-tile" + (n && warn ? " warn" : "")} onClick={() => navigate("alltasks", arg)}
                aria-label={`${n} ${label.toLowerCase()} – show these tasks`}>
                <span className="pd-n">{n}</span>
                <span className="pd-l">{label}</span>
              </button>
            ))}
          </div>
          <p className="pd-note">Right now, across all dates. Tap a number to see those tasks.</p>
        </section>

        <section className="panel pd-sec" aria-labelledby="pd-ontime">
          <h2 id="pd-ontime" className="pd-h">Team on-time</h2>
          {cur ? (
            <>
              <div className="pd-big">
                {cur.pct}%
                {delta !== null && (
                  <span className={"pd-delta" + (delta < 0 ? " down" : delta > 0 ? " up" : "")}>
                    {delta > 0 ? "▲ " : delta < 0 ? "▼ " : ""}{delta === 0 ? "Same as" : `${Math.abs(delta)} pts vs`} {PREV[period]}
                  </span>
                )}
              </div>
              <div className={"bar " + (cur.pct >= 70 ? "" : cur.pct >= 40 ? "amber" : "red")}><i style={{ width: cur.pct + "%" }} /></div>
              <p className="pd-note">{cur.n} {cur.n === 1 ? "task" : "tasks"} finished {period === "today" ? "today" : periodWord}, judged against their original due date{prev ? "" : `; nothing finished ${PREV[period]} to compare`}.</p>
            </>
          ) : (
            <p className="pd-empty">No tasks finished {period === "today" ? "today" : periodWord} yet.</p>
          )}
        </section>

        <section className="panel pd-sec" aria-labelledby="pd-mix">
          <h2 id="pd-mix" className="pd-h">Status mix</h2>
          {due.length ? (
            <>
              <div className="pd-stack" role="img" aria-label={MIX.map(([k, l]) => `${l} ${mix[k]}`).join(", ")}>
                {MIX.filter(([k]) => mix[k]).map(([k, l, c]) => (
                  <i key={k} style={{ flexGrow: mix[k], background: c }} />
                ))}
              </div>
              <ul className="pd-legend">
                {MIX.map(([k, l, c]) => (
                  <li key={k}><span className="pd-sw" style={{ background: c }} />{l} <strong>{mix[k]}</strong></li>
                ))}
              </ul>
              <p className="pd-note">{due.length} total due {period === "today" ? "today" : periodWord}</p>
            </>
          ) : (
            <p className="pd-empty">No tasks due {period === "today" ? "today" : periodWord}.</p>
          )}
        </section>

        <section className="panel pd-sec" aria-labelledby="pd-lag">
          <h2 id="pd-lag" className="pd-h">Who's lagging</h2>
          {lagging.length === 0 ? (
            <p className="pd-empty">Nobody's behind right now — nice.</p>
          ) : (
            <ul className="pd-lag">
              {lagging.map(({ u, od, carried3, openBlockers, onTimePct }) => {
                const bits = [
                  od && `${od} overdue`,
                  carried3 && `${carried3} pushed 3+ times`,
                  openBlockers && `${openBlockers} ${openBlockers === 1 ? "blocker" : "blockers"}`,
                ].filter(Boolean);
                return (
                  <li key={u.id}>
                    <button type="button" className="pd-lagrow" onClick={() => navigate("alltasks", { assignee: u.id })}>
                      <span className="pd-lagname">
                        <strong>{u.name}</strong>
                        <span className="pd-lagbits">{bits.join(" · ")}</span>
                      </span>
                      {onTimePct == null ? (
                        <span className="pd-lagpct none">No due tasks yet</span>
                      ) : (
                        <span className="pd-lagpct">
                          <span className={onTimePct < 60 ? "warnflag" : ""}>{onTimePct}%</span>
                          <span className="pd-lagbar"><i style={{ width: onTimePct + "%" }} className={onTimePct < 60 ? "low" : ""} /></span>
                          <span className="pd-lagcap">on time</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

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
          <RowTable meta={[1, 2, 3]} side={4}><table>
            <thead>
              <tr>
                <th>Team member</th>
                <th>Overdue</th>
                <th>Pushed 3+ times</th>
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
          </table></RowTable>
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
