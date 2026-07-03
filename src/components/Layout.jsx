import React from "react";
import { useApp } from "../context/AppData.jsx";
import { OPEN_STATUSES, CARRY_THRESHOLD } from "../lib/logic.js";
import { daysSince, todayStr } from "../lib/format.js";

const MEMBER_NAV = [
  ["myday", "My Day"],
  ["mytasks", "My Tasks"],
  ["goals", "Goals"],
  ["myweek", "My Week"],
  ["blockers", "Blockers"],
];

const COMMAND_NAV = [
  ["dashboard", "Command Dashboard"],
  ["alltasks", "All Tasks"],
  ["people", "People / Workload"],
  ["grid", "Projects"], // each project with its tasks (route key kept as "grid")
  ["projects", "Portfolio"], // per-project counts / completion comparison
  ["standup", "Standup Board"],
  ["reviews", "Reviews"],
  ["settings", "Admin Settings"],
];

// Viewer sees everything an admin can, read-only (no personal My* tabs or the
// admin management console).
const VIEWER_NAV = [
  ["dashboard", "Dashboard"],
  ["alltasks", "All Tasks"],
  ["people", "People / Workload"],
  ["grid", "Projects"],
  ["projects", "Portfolio"],
  ["standup", "Standup Board"],
  ["reviews", "Reviews"],
  ["goals", "Goals"],
  ["blockers", "Blockers"],
];

function navConfig(role) {
  if (role === "admin" || role === "manager") {
    return {
      "Your work": MEMBER_NAV,
      Command: COMMAND_NAV.filter((a) => role === "admin" || a[0] !== "settings"),
    };
  }
  if (role === "viewer") {
    return { Watch: VIEWER_NAV };
  }
  return { "Your work": MEMBER_NAV };
}

export default function Layout({ view, navigate, children }) {
  const { me, db, signOut } = useApp();
  if (!me) return null;
  const cfg = navConfig(me.role);
  const today = todayStr();

  const openBlockers = db.blockers.filter((b) => b.status === "open").length;
  const needsAttention =
    db.tasks.filter(
      (t) => OPEN_STATUSES.includes(t.status) && t.carry_forward_count >= CARRY_THRESHOLD
    ).length +
    db.blockers.filter((b) => b.status === "open" && daysSince(b.created_at) >= 2).length +
    db.keyResults.filter((k) => k.confidence !== "on_track").length;
  const myDayCount = db.tasks.filter(
    (t) =>
      t.assignee_user_id === me.id &&
      t.status !== "done" &&
      t.status !== "cancelled" &&
      (t.planned_for_date === today ||
        (OPEN_STATUSES.includes(t.status) && t.due_date <= today))
  ).length;

  const pillFor = (key) => {
    if (key === "blockers" && openBlockers) return { text: openBlockers, warn: false };
    if (key === "dashboard" && needsAttention) return { text: needsAttention, warn: true };
    if (key === "myday" && myDayCount) return { text: myDayCount, warn: false };
    return null;
  };

  return (
    <div className="app">
      <nav className="side">
        <div className="brand">
          Cadence
          <strong>Task Tracker</strong>
        </div>
        {Object.entries(cfg).map(([group, items]) => (
          <div key={group}>
            <div className="nav-label">{group}</div>
            {items.map(([key, label]) => {
              const pill = pillFor(key);
              return (
                <button
                  key={key}
                  className={"navbtn" + (view === key ? " active" : "")}
                  onClick={() => navigate(key)}
                >
                  <span>{label}</span>
                  {pill && (
                    <span className={"pill" + (pill.warn ? " warn" : "")}>{pill.text}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="whoami">
          <div className="nm">{me.name}</div>
          <div className="rl">{me.role}</div>
          <button className="btn ghost" onClick={signOut}>
            Log out
          </button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
