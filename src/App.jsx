import React, { useState, useMemo } from "react";
import { useApp } from "./context/AppData.jsx";
import { NavContext } from "./context/Nav.jsx";
import Layout from "./components/Layout.jsx";
import { ModalHost } from "./components/ModalHost.jsx";
import { GATED_TABS, tabAccessMap } from "./lib/tabAccess.js";

import Login from "./pages/Login.jsx";
import MyDay from "./pages/MyDay.jsx";
import MyTasks from "./pages/MyTasks.jsx";
import MyWeek from "./pages/MyWeek.jsx";
import Blockers from "./pages/Blockers.jsx";
import Notifications from "./pages/Notifications.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AllTasks from "./pages/AllTasks.jsx";
import People from "./pages/People.jsx";
import Grid from "./pages/Grid.jsx";
import Acceptance from "./pages/Acceptance.jsx";
import Done from "./pages/Done.jsx";
import EffortsOutcome from "./pages/EffortsOutcome.jsx";
import Campaigns from "./pages/Campaigns.jsx";
import HubSpotActivity from "./pages/HubSpotActivity.jsx";
import ColdCalling from "./pages/ColdCalling.jsx";
import Settings from "./pages/Settings.jsx";

const ROUTES = {
  myday: MyDay,
  mytasks: MyTasks,
  myweek: MyWeek,
  blockers: Blockers,
  notifications: Notifications,
  dashboard: Dashboard,
  alltasks: AllTasks,
  acceptance: Acceptance,
  done: Done,
  people: People,
  grid: Grid,
  efforts: EffortsOutcome,
  campaigns: Campaigns,
  hubspot: HubSpotActivity,
  coldcalling: ColdCalling,
  settings: Settings,
};

// Goals and Reviews are hidden from the sidebar and routing for now (pages,
// tables and data are kept; add them back here and in Layout.jsx to restore).
const MEMBER_VIEWS = ["myday", "mytasks", "notifications", "myweek", "blockers"];
// Managers are scoped: their work tabs + their project oversight, but no
// People/Workload and no admin Settings.
const MANAGER_VIEWS = [
  ...MEMBER_VIEWS,
  "dashboard",
  "alltasks",
  "acceptance",
  "done",
  "grid",
  "efforts",
];
// Viewer = executive assistant: read-only access to every oversight view.
const VIEWER_VIEWS = [
  "dashboard",
  "alltasks",
  "acceptance",
  "done",
  "people",
  "grid",
  "efforts",
  "blockers",
];

// Campaigns, HubSpot Team Activity and Cold Calling Activity follow per-tab access (any role can be
// granted them); every other tab is fixed by role.
function allowedView(role, view, access) {
  if (view in GATED_TABS) return access[view] ? view : allowedView(role, null, access);
  if (role === "member") return MEMBER_VIEWS.includes(view) ? view : "myday";
  if (role === "manager") return MANAGER_VIEWS.includes(view) ? view : "dashboard";
  if (role === "viewer") return VIEWER_VIEWS.includes(view) ? view : "dashboard";
  return ROUTES[view] ? view : "dashboard"; // admin sees everything
}

export default function App() {
  const { authReady, session, me, loadingData, db } = useApp();
  const [view, setView] = useState("myday");
  const [arg, setArg] = useState(null);

  const navigate = (v, a = null) => {
    setView(v);
    setArg(a);
    window.scrollTo(0, 0);
  };

  const navValue = useMemo(() => ({ view, arg, navigate }), [view, arg]);

  if (!authReady) {
    return <div className="loading">Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }
  if (loadingData || !me) {
    return <div className="loading">Loading your workspace…</div>;
  }

  const safeView = allowedView(me.role, view, tabAccessMap(me, db));
  const Page = ROUTES[safeView] || MyDay;

  return (
    <NavContext.Provider value={{ ...navValue, view: safeView }}>
      <ModalHost>
        <Layout view={safeView} navigate={navigate}>
          <Page />
        </Layout>
      </ModalHost>
    </NavContext.Provider>
  );
}
