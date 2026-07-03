import React, { useState, useMemo } from "react";
import { useApp } from "./context/AppData.jsx";
import { NavContext } from "./context/Nav.jsx";
import Layout from "./components/Layout.jsx";
import { ModalHost } from "./components/ModalHost.jsx";

import Login from "./pages/Login.jsx";
import MyDay from "./pages/MyDay.jsx";
import MyTasks from "./pages/MyTasks.jsx";
import Goals from "./pages/Goals.jsx";
import MyWeek from "./pages/MyWeek.jsx";
import Blockers from "./pages/Blockers.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AllTasks from "./pages/AllTasks.jsx";
import People from "./pages/People.jsx";
import Projects from "./pages/Projects.jsx";
import Grid from "./pages/Grid.jsx";
import StandupBoard from "./pages/StandupBoard.jsx";
import Reviews from "./pages/Reviews.jsx";
import Settings from "./pages/Settings.jsx";

const ROUTES = {
  myday: MyDay,
  mytasks: MyTasks,
  goals: Goals,
  myweek: MyWeek,
  blockers: Blockers,
  dashboard: Dashboard,
  alltasks: AllTasks,
  people: People,
  projects: Projects,
  grid: Grid,
  standup: StandupBoard,
  reviews: Reviews,
  settings: Settings,
};

const MEMBER_VIEWS = ["myday", "mytasks", "goals", "myweek", "blockers"];
// Viewer = executive assistant: read-only access to every oversight view.
const VIEWER_VIEWS = [
  "dashboard",
  "alltasks",
  "people",
  "projects",
  "grid",
  "standup",
  "reviews",
  "goals",
  "blockers",
];

function allowedView(role, view) {
  if (role === "member") return MEMBER_VIEWS.includes(view) ? view : "myday";
  if (role === "viewer") return VIEWER_VIEWS.includes(view) ? view : "dashboard";
  return ROUTES[view] ? view : "dashboard"; // admin / manager see everything
}

export default function App() {
  const { authReady, session, me, loadingData } = useApp();
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

  const safeView = allowedView(me.role, view);
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
