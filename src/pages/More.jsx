import React, { useState } from "react";
import { useApp } from "../context/AppData.jsx";
import { useNav } from "../context/Nav.jsx";
import { BOTTOM_TABS, BADGE_TABS, navGroups, usePills } from "../components/Layout.jsx";
import ThemeSwitch from "../components/ThemeSwitch.jsx";
import Icon from "../components/Icon.jsx";

// Phones: every screen that isn't in the bottom bar, plus your account
// (theme, refresh, log out). Same groups as the desktop sidebar.
export default function More() {
  const { me, db, signOut, refresh } = useApp();
  const { navigate } = useNav();
  const pillFor = usePills();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const tabKeys = (BOTTOM_TABS[me.role] || BOTTOM_TABS.member).map(([k]) => k);
  const groups = Object.entries(navGroups(me, db))
    .map(([g, items]) => [g, items.filter(([k]) => !tabKeys.includes(k))])
    .filter(([, items]) => items.length);

  async function reload() {
    setBusy(true);
    setMsg("");
    try {
      await refresh();
      setMsg("Up to date.");
    } catch (e) {
      setMsg("Couldn't refresh – check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="more">
      <h1 className="sr-only">More</h1>
      {groups.map(([g, items]) => (
        <section key={g} className="more-sec" aria-labelledby={"more-" + g}>
          <h2 className="more-h" id={"more-" + g}>{g}</h2>
          <div className="more-list">
            {items.map(([key, label]) => {
              const pill = BADGE_TABS.includes(key) ? pillFor(key) : null;
              return (
                <button key={key} type="button" className="more-row" onClick={() => navigate(key)}>
                  <span className="more-lbl">{label}</span>
                  {pill && <span className={"more-pill" + (pill.warn ? " warn" : "")}>{pill.text > 99 ? "99+" : pill.text}</span>}
                  <Icon name="chevron" size={18} className="more-chev" />
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section className="more-sec" aria-labelledby="more-account">
        <h2 className="more-h" id="more-account">Account</h2>
        <div className="more-list">
          <div className="more-row static">
            <span className="more-lbl">
              <strong>{me.name}</strong>
              <span className="more-sub">{me.role}</span>
            </span>
          </div>
          <div className="more-row static more-theme">
            <span className="more-lbl">Theme</span>
            <ThemeSwitch />
          </div>
          <button type="button" className="more-row" onClick={reload} disabled={busy}>
            <span className="more-lbl">{busy ? "Refreshing…" : "Refresh data"}</span>
            <Icon name="refresh" size={18} className={"more-chev" + (busy ? " ix-spin" : "")} />
          </button>
        </div>
        <p className="more-msg" role="status" aria-live="polite">{msg}</p>
        <div className="more-list more-logout">
          <button type="button" className="more-row" onClick={signOut}>
            <span className="more-lbl">Log out</span>
          </button>
        </div>
      </section>
    </div>
  );
}
