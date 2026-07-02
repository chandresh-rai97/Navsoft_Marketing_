import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import { useModals } from "../components/ModalHost.jsx";
import PageHead from "../components/PageHead.jsx";
import { OPEN_STATUSES, CARRY_THRESHOLD, CONF_LABEL } from "../lib/logic.js";
import { todayStr, daysSince, pct } from "../lib/format.js";

export default function Dashboard() {
  const { db, uname, activeUsers, krProgress, isOverdue, MOVE_REASON_AFTER } = useApp();
  const { navigate } = useNav();
  const modals = useModals();
  const t = todayStr();

  const dueToday = db.tasks.filter((x) => x.due_date === t && OPEN_STATUSES.includes(x.status)).length;
  const overdue = db.tasks.filter((x) => isOverdue(x)).length;
  const blocked = db.tasks.filter((x) => x.status === "blocked").length;
  const carried3 = db.tasks.filter(
    (x) => OPEN_STATUSES.includes(x.status) && x.carry_forward_count >= CARRY_THRESHOLD
  ).length;
  const pending = db.tasks.filter((x) => x.status === "done_pending_acceptance").length;

  const attn = [];
  db.tasks
    .filter((x) => OPEN_STATUSES.includes(x.status) && x.carry_forward_count >= CARRY_THRESHOLD)
    .forEach((x) =>
      attn.push({
        ico: "↻",
        node: (
          <span>
            <strong>{x.title}</strong> pushed {x.carry_forward_count}× — {uname(x.assignee_user_id)}
          </span>
        ),
        onClick: () => modals.openTask(x.id),
      })
    );
  db.blockers
    .filter((b) => b.status === "open" && daysSince(b.created_at) >= 2)
    .forEach((b) =>
      attn.push({
        ico: "⛔",
        node: <span>Blocker aging {daysSince(b.created_at)}d — {b.description.slice(0, 60)}</span>,
        onClick: () => navigate("blockers"),
      })
    );
  db.keyResults
    .filter((k) => k.confidence !== "on_track")
    .forEach((k) =>
      attn.push({
        ico: "🎯",
        node: <span><strong>{k.title}</strong> is {CONF_LABEL[k.confidence].toLowerCase()}</span>,
        onClick: () => navigate("okrtree", k.id),
      })
    );
  db.tasks
    .filter((x) => x.due_date_change_count >= MOVE_REASON_AFTER && OPEN_STATUSES.includes(x.status))
    .forEach((x) =>
      attn.push({
        ico: "📅",
        node: <span><strong>{x.title}</strong> moved {x.due_date_change_count}×</span>,
        onClick: () => modals.openTask(x.id),
      })
    );

  const standupMembers = activeUsers().filter((u) => u.role === "member" || u.role === "manager");
  const submitted = db.standups.filter((s) => s.date === t).length;

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
        sub="Team health, always current. Rolled up from the same daily work everyone is already doing — no report to assemble."
      />
      <div className="cards">
        {stat(dueToday, "Due today")}
        {stat(overdue, "Overdue", overdue ? "alert" : "")}
        {stat(blocked, "Blocked", blocked ? "warn" : "")}
        {stat(carried3, "Pushed 3+×", carried3 ? "alert" : "")}
        {stat(pending, "Awaiting accept", pending ? "warn" : "")}
      </div>

      <div className="panel">
        <h2>
          Key Result confidence <span className="muted-lbl">click a KR to drill in</span>
        </h2>
        <div className="kr-heat">
          {db.keyResults.map((k) => (
            <div key={k.id} className={"kr-cell " + k.confidence} onClick={() => navigate("okrtree", k.id)}>
              <div className="krt">{k.title}</div>
              <div className="krn">
                {pct(krProgress(k))}% · {CONF_LABEL[k.confidence]} · {k.kr_type}
              </div>
            </div>
          ))}
          {db.keyResults.length === 0 && <div className="empty">No Key Results yet.</div>}
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>Needs attention</h2>
          {attn.length ? (
            attn.map((a, i) => (
              <div className="attn-item pointer" key={i} onClick={a.onClick}>
                <span className="attn-ico">{a.ico}</span>
                {a.node}
              </div>
            ))
          ) : (
            <div className="empty">All clear — nothing flagged.</div>
          )}
        </div>

        <div className="panel">
          <h2>
            Today's standups{" "}
            <span className="muted-lbl">
              {submitted}/{standupMembers.length} in
            </span>
          </h2>
          {standupMembers.map((u) => {
            const s = db.standups.find((x) => x.user_id === u.id && x.date === t);
            return (
              <div className="mini" key={u.id}>
                <span>{u.name}</span>
                <span>
                  {s ? (
                    <>
                      <span className="badge ok">submitted</span> {s.today_task_ids.length} planned
                    </>
                  ) : (
                    <span className="badge no">not yet</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
