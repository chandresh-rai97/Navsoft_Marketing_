import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useApp } from "./context/AppData.jsx";
import { NavContext } from "./context/Nav.jsx";
import Layout from "./components/Layout.jsx";
import { ModalHost } from "./components/ModalHost.jsx";
import { GATED_TABS, tabAccessMap } from "./lib/tabAccess.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { clearViewState } from "./hooks/useViewState.js";
import {
  initHistory,
  parseLocation,
  onRouteChange,
  pushRoute,
  replaceRoute,
  pushTask,
  closeTask,
  currentKey,
  savedScroll,
} from "./lib/router.js";

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
import More from "./pages/More.jsx";
import LoadingSkeleton from "./components/LoadingSkeleton.jsx";

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
  more: More,
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
  if (view === "more") return view; // phones: the list of everything else + account
  if (view in GATED_TABS) return access[view] ? view : allowedView(role, null, access);
  if (role === "member") return MEMBER_VIEWS.includes(view) ? view : "myday";
  if (role === "manager") return MANAGER_VIEWS.includes(view) ? view : "dashboard";
  if (role === "viewer") return VIEWER_VIEWS.includes(view) ? view : "dashboard";
  return ROUTES[view] ? view : "dashboard"; // admin sees everything
}

initHistory();

export default function App() {
  const { authReady, session, me, loadingData, db } = useApp();
  const mobile = useIsMobile();
  // Where we are comes from the URL, so refresh and shared links land here.
  const [loc, setLoc] = useState(() => parseLocation());
  const restoreRef = useRef(false);
  const userRef = useRef(null);
  if (me && userRef.current !== me.id) {
    if (userRef.current) clearViewState(); // someone else signed in: forget their filters
    userRef.current = me.id;
  }

  // Browser / phone Back and Forward.
  useEffect(
    () =>
      onRouteChange(() => {
        restoreRef.current = true;
        setLoc(parseLocation());
      }),
    []
  );

  const view = loc.view;
  const arg = loc.arg;
  const navigate = (v, a = null) => {
    pushRoute(v, a);
    restoreRef.current = false;
    setLoc({ view: v, arg: a, task: null });
    window.scrollTo(0, 0);
  };
  // Change the screen without adding history (e.g. the project you had open is gone).
  const replace = (v, a = null) => {
    replaceRoute(v, a, loc.task);
    setLoc((l) => ({ ...l, view: v, arg: a }));
  };
  const openTask = (id) => {
    pushTask(view, arg, id || "new");
    setLoc((l) => ({ ...l, task: id || "new" }));
  };
  const closeTaskView = () => {
    closeTask(view, arg);
    setLoc((l) => ({ ...l, task: null }));
  };

  const navValue = useMemo(
    () => ({ view, arg, task: loc.task, navigate, replace, openTask, closeTask: closeTaskView }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, arg, loc.task]
  );

  const ready = authReady && session && !loadingData && me;
  let safeView = ready ? allowedView(me.role, view, tabAccessMap(me, db)) : null;
  if (safeView === "more" && !mobile) safeView = allowedView(me.role, null, tabAccessMap(me, db));
  const safeArg = safeView === view ? arg : null;

  // A screen you can't open (or "/"): show your home screen and fix the URL.
  useEffect(() => {
    if (ready && safeView !== view) replaceRoute(safeView, safeArg, loc.task);
  }, [ready, safeView, view, safeArg, loc.task]);

  // Back/Forward: put the scroll position back where it was.
  useLayoutEffect(() => {
    if (!restoreRef.current) return;
    restoreRef.current = false;
    const y = savedScroll(currentKey());
    window.scrollTo(0, y || 0);
  }, [loc.view, loc.arg]);

  if (!authReady) {
    return <div className="loading">Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }
  if (loadingData || !me) {
    return mobile ? <LoadingSkeleton /> : <div className="loading">Loading your workspace…</div>;
  }

  const Page = ROUTES[safeView] || MyDay;

  return (
    <NavContext.Provider value={{ ...navValue, view: safeView, arg: safeArg }}>
      <ModalHost>
        <Layout view={safeView} arg={safeArg} navigate={navigate}>
          <Page key={safeView + (safeArg ? JSON.stringify(safeArg) : "")} />
        </Layout>
      </ModalHost>
    </NavContext.Provider>
  );
}
