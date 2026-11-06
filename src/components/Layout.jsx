import React from "react";
import { useApp } from "../context/AppData.jsx";
import { OPEN_STATUSES, CARRY_THRESHOLD } from "../lib/logic.js";
import { daysSince, todayStr } from "../lib/format.js";
import { tabAccessMap } from "../lib/tabAccess.js";
import ThemeSwitch from "./ThemeSwitch.jsx";
import Icon from "./Icon.jsx";
import { canGoBackInApp } from "../lib/router.js";

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

// Phone bottom bar: four most-used screens for each role, then "More"
// (everything else + account). [key, label, icon]
export const BOTTOM_TABS = {
  member: [["myday", "My Day", "sun"], ["mytasks", "My Tasks", "checks"], ["notifications", "Notifications", "bell"], ["blockers", "Blockers", "octagon"]],
  manager: [["dashboard", "Dashboard", "grid"], ["alltasks", "All Tasks", "list"], ["acceptance", "Acceptance", "accept"], ["myday", "My Day", "sun"]],
  admin: [["dashboard", "Dashboard", "grid"], ["alltasks", "All Tasks", "list"], ["acceptance", "Acceptance", "accept"], ["myday", "My Day", "sun"]],
  viewer: [["dashboard", "Dashboard", "grid"], ["alltasks", "All Tasks", "list"], ["acceptance", "Acceptance", "accept"], ["people", "People", "people"]],
};

// Sidebar groups for this user (shared with the phone "More" screen).
export function navGroups(me, db) {
  return navConfig(me.role, tabAccessMap(me, db));
}

// Badge counts shown next to sidebar items, bottom tabs and More rows.
export function usePills() {
  const { me, db, canReview, unreadCount } = useApp();
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

  return (key) => {
    if (key === "notifications" && unreadCount) return { text: unreadCount, warn: true };
    if (key === "blockers" && openBlockers) return { text: openBlockers, warn: false };
    if (key === "acceptance" && pendingReview) return { text: pendingReview, warn: true };
    if (key === "dashboard" && needsAttention) return { text: needsAttention, warn: true };
    if (key === "myday" && myDayCount) return { text: myDayCount, warn: false };
    return null;
  };
}

export default function Layout({ view, arg, navigate, children }) {
  const { me, db, signOut, unreadCount } = useApp();
  const pillFor = usePills();
  if (!me) return null;
  const go = (key) => navigate(key);
  const cfg = navConfig(me.role, tabAccessMap(me, db));

  const allItems = Object.values(cfg).flat();
  const tabs = BOTTOM_TABS[me.role] || BOTTOM_TABS.member;
  const tabKeys = tabs.map(([k]) => k);
  const title = view === "more" ? "More" : (allItems.find(([k]) => k === view) || [null, "Cadence"])[1];
  // Screens reached from More (or a project opened from Projects) get a Back button.
  const atRoot = (tabKeys.includes(view) || view === "more") && !arg;
  const back = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate(view === "grid" && arg ? "grid" : "more");
  };
  // Tapping the tab you're on: back to that tab's top (or its first screen).
  const tapTab = (key) => {
    if (key !== view) return go(key);
    if (arg) return go(key);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  const moreItems = allItems.filter(([k]) => !tabKeys.includes(k));
  const moreBadge = moreItems.some(([k]) => pillFor(k));
  // Admins and managers have no Notifications tab: a bell in the top bar instead.
  const showBell = (me.role === "admin" || me.role === "manager") && allItems.some(([k]) => k === "notifications");

  return (
    <div className="app">
      {/* Phones only: top bar (Back · title · bell) and the bottom tab bar. */}
      <header className="mtop">
        {!atRoot && (
          <button type="button" className="mtop-btn" aria-label="Back" onClick={back}>
            <Icon name="back" />
          </button>
        )}
        <span className={"mtop-title" + (atRoot ? " at-root" : "")} aria-hidden="true">{title}</span>
        <div className="mtop-actions" id="mtop-actions" />
        {showBell && (
          <button
            type="button"
            className={"mtop-btn mtop-bell" + (view === "notifications" ? " on" : "")}
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            aria-current={view === "notifications" ? "page" : undefined}
            onClick={() => go("notifications")}
          >
            <Icon name="bell" filled={view === "notifications"} />
            {unreadCount > 0 && <span className="mtop-badge" aria-hidden="true">{unreadCount}</span>}
          </button>
        )}
      </header>
      <nav className="side" aria-label="Main menu">
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
                  onClick={() => go(key)}
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
      <nav className="mtabs" aria-label="Main">
        {[...tabs, ["more", "More", "more"]].map(([key, label, icon]) => {
          const active = view === key;
          const pill = key === "more" ? null : pillFor(key);
          return (
            <button key={key} type="button" className={"mtab" + (active ? " active" : "")} onClick={() => tapTab(key)} aria-current={active ? "page" : undefined}
              aria-label={label + (pill ? `, ${pill.text}` : "") + (key === "more" && moreBadge ? ", has updates" : "")}>
              <Icon name={icon} filled={active} className="mtab-ico" />
              <span className="mtab-lbl">{label}</span>
              {pill && <span className={"mtab-pill" + (pill.warn ? " warn" : "")} aria-hidden="true">{pill.text}</span>}
              {key === "more" && moreBadge && <span className="mtab-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
