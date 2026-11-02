import React from "react";
import { useApp } from "../context/AppData.jsx";
import { OPEN_STATUSES, CARRY_THRESHOLD } from "../lib/logic.js";
import { daysSince, todayStr } from "../lib/format.js";
import { tabAccessMap } from "../lib/tabAccess.js";
import ThemeSwitch from "./ThemeSwitch.jsx";

const MEMBER_NAV = [
  ["myday", "My Day"],
  ["mytasks", "My Tasks"],
  ["notifications", "Notifications"],
  ["myweek", "My Week"],
  ["blockers", "Blockers"],
];

const COMMAND_NAV = [
  ["dashboard", "Command Dashboard"],
  ["alltasks", "All Tasks"],
  ["acceptance", "Acceptance"],
  ["done", "Done"],
  ["people", "People / Workload"],
  ["grid", "Projects"], // summary boxes → drill-in (route key kept as "grid")
  ["efforts", "Efforts vs Outcome"],
  ["campaigns", "Campaigns"],
  ["hubspot", "HubSpot Team Activity"],
  ["coldcalling", "Cold Calling Activity"],
  ["settings", "Admin Settings"],
];

// Viewer sees everything an admin can, read-only (no personal My* tabs or the
// admin management console).
const VIEWER_NAV = [
  ["dashboard", "Dashboard"],
  ["alltasks", "All Tasks"],
  ["acceptance", "Acceptance"],
  ["done", "Done"],
  ["people", "People / Workload"],
  ["grid", "Projects"],
  ["efforts", "Efforts vs Outcome"],
  ["campaigns", "Campaigns"],
  ["hubspot", "HubSpot Team Activity"],
  ["coldcalling", "Cold Calling Activity"],
  ["blockers", "Blockers"],
];

// Tabs with per-tab access: shown to whoever has been granted them, any role.
const TAB_NAV = [
  ["campaigns", "Campaigns"],
  ["hubspot", "HubSpot Team Activity"],
  ["coldcalling", "Cold Calling Activity"],
];
const gate = (items, access) => items.filter(([k]) => !(k in access) || access[k]);

// `access`: { campaigns, hubspot } — may this user see each per-tab-access tab.
function navConfig(role, access) {
  if (role === "admin") {
    return { "Your work": MEMBER_NAV, Command: COMMAND_NAV };
  }
  if (role === "manager") {
    // Managers are scoped to their own projects — no People/Workload or Settings.
    return {
      "Your work": MEMBER_NAV,
      Command: gate(COMMAND_NAV.filter((a) => a[0] !== "settings" && a[0] !== "people"), access),
    };
  }
  if (role === "viewer") {
    return { Watch: gate(VIEWER_NAV, access) };
  }
  return { "Your work": [...MEMBER_NAV, ...gate(TAB_NAV, access)] };
}

export default function Layout({ view, navigate, children }) {
  const { me, db, signOut, canReview, unreadCount } = useApp();
  if (!me) return null;
  const cfg = navConfig(me.role, tabAccessMap(me, db));
  const today = todayStr();

  const pendingReview = db.tasks.filter(
    (t) => t.status === "done_pending_acceptance" && canReview(t)
  ).length;
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
    if (key === "notifications" && unreadCount) return { text: unreadCount, warn: true };
    if (key === "blockers" && openBlockers) return { text: openBlockers, warn: false };
    if (key === "acceptance" && pendingReview) return { text: pendingReview, warn: true };
    if (key === "dashboard" && needsAttention) return { text: needsAttention, warn: true };
    if (key === "myday" && myDayCount) return { text: myDayCount, warn: false };
    return null;
  };

  return (
    <div className="app">
      <nav className="side">
        <img className="brand-logo" src="/brand/navai-lockup-light.png" alt="NavAI" />
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
          <ThemeSwitch />
          <button className="btn ghost" onClick={signOut}>
            Log out
          </button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
