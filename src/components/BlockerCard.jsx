import React, { useState } from "react";
import { useApp } from "../context/AppData.jsx";
import { useDialog } from "./Dialog.jsx";
import { daysSince } from "../lib/format.js";

export default function BlockerCard({ b }) {
  const { db, me, uname, isManager, activeUsers, assignHelper, resolveBlocker } = useApp();
  const dlg = useDialog();
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState(b.owner_user_id || "");

  const task = b.task_id ? db.tasks.find((t) => t.id === b.task_id) : null;
  const canHelp = b.status === "open" && (isManager() || !b.owner_user_id);
  const canResolve =
    b.status === "open" && (isManager() || b.raised_by_user_id === me.id || b.owner_user_id === me.id);

  async function resolve() {
    if (await dlg.confirm("Mark this blocker as resolved?")) await resolveBlocker(b.id);
  }

  return (
    <div className={"blocker-card" + (b.status === "resolved" ? " resolved" : "")}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{b.description}</div>
        <div className="age">{b.status === "open" ? `${daysSince(b.created_at)}d open` : "resolved"}</div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
        Raised by {uname(b.raised_by_user_id)} · Helper: {b.owner_user_id ? uname(b.owner_user_id) : "Unassigned"}
        {task ? ` · Task: ${task.title}` : ""}
      </div>

      {picking && (
        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7 }}>
            <option value="">— pick a helper —</option>
            {activeUsers().map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            className="btn sm"
            onClick={async () => {
              if (!pick) return;
              await assignHelper(b.id, pick);
              setPicking(false);
            }}
          >
            Assign
          </button>
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: 9 }}>
        {canHelp &&
          (isManager() ? (
            <button className="btn sm ghost" onClick={() => setPicking((p) => !p)}>
              {b.owner_user_id ? "Reassign helper" : "Assign helper"}
            </button>
          ) : (
            <button className="btn sm ghost" onClick={() => assignHelper(b.id, me.id)}>
              I'll help
            </button>
          ))}
        {canResolve && (
          <button className="btn sm" onClick={resolve}>
            Mark resolved
          </button>
        )}
      </div>
    </div>
  );
}
