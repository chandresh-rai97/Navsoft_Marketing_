import React from "react";
import { useApp } from "../context/AppData.jsx";
import PageHead from "../components/PageHead.jsx";
import { OPEN_STATUSES } from "../lib/logic.js";
import { pct } from "../lib/format.js";

export default function People() {
  const { db, activeUsers, taskDone, isOverdue } = useApp();
  const members = activeUsers().filter((u) => u.role !== "viewer");

  return (
    <>
      <PageHead
        title="People / Workload"
        sub="Who's carrying what, completion rate, and carry-forward rate — so you can spot overload and quiet slippage early."
      />
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))" }}>
        {members.map((u) => {
          const mine = db.tasks.filter((t) => t.assignee_user_id === u.id);
          const open = mine.filter((t) => OPEN_STATUSES.includes(t.status)).length;
          const doneCount = mine.filter(taskDone).length;
          const completion = mine.length ? doneCount / mine.length : 0;
          const carriedRate = mine.length
            ? mine.filter((t) => t.carry_forward_count > 0).length / mine.length
            : 0;
          const overdue = mine.filter((t) => isOverdue(t)).length;
          const barCls = completion >= 0.6 ? "" : completion >= 0.3 ? "amber" : "red";
          return (
            <div className="person-card" key={u.id}>
              <div className="pn">{u.name}</div>
              <div className="pr">{u.role}</div>
              <div style={{ margin: "10px 0 4px" }}>
                <div className={"bar " + barCls}>
                  <i style={{ width: pct(completion) + "%" }} />
                </div>
              </div>
              <div className="mini">
                <span>Open tasks</span>
                <span>
                  <strong>{open}</strong>
                </span>
              </div>
              <div className="mini">
                <span>Completion rate</span>
                <span>{pct(completion)}%</span>
              </div>
              <div className="mini">
                <span>Carry-forward rate</span>
                <span className={carriedRate >= 0.4 ? "warnflag" : ""}>{pct(carriedRate)}%</span>
              </div>
              <div className="mini">
                <span>Overdue now</span>
                <span className={overdue ? "warnflag" : ""}>{overdue}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
