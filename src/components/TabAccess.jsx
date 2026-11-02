import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppData.jsx";
import Modal from "./Modal.jsx";
import { loadTabGrants, saveTabGrants } from "../lib/tabAccess.js";

const ROLE_TOGGLES = [
  ["manager", "Managers"],
  ["viewer", "Viewers"],
  ["member", "Members"],
];

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Toggle({ label, checked, disabled, note, onChange }) {
  return (
    <label className={"ta-toggle" + (disabled ? " disabled" : "")}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="ta-track" aria-hidden="true"><span className="ta-knob" /></span>
      <span className="ta-label">{label}</span>
      {note && <span className="ta-note">{note}</span>}
    </label>
  );
}

// "Who can see this tab": role toggles and per-person ticks (admins only).
function AccessPanel({ tabKey, onClose }) {
  const { db, refresh } = useApp();
  const [roles, setRoles] = useState(null);
  const [users, setUsers] = useState(new Set());
  const [hidden, setHidden] = useState([]); // grants for people not listed (inactive), kept as they are
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const people = useMemo(
    () => db.users.filter((u) => u.active).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [db.users]
  );

  React.useEffect(() => {
    let live = true;
    loadTabGrants(tabKey)
      .then((g) => {
        if (!live) return;
        const listed = new Set(people.map((p) => p.id));
        setRoles(new Set(g.roles.filter((r) => r !== "admin")));
        setUsers(new Set(g.users.filter((id) => listed.has(id))));
        setHidden(g.users.filter((id) => !listed.has(id)));
      })
      .catch((e) => live && setErr("Couldn't load who can see this tab: " + (e.message || e)));
    return () => {
      live = false;
    };
  }, [tabKey, people]);

  const shown = people.filter((p) => {
    const s = q.trim().toLowerCase();
    return !s || (p.name || "").toLowerCase().includes(s) || (p.email || "").toLowerCase().includes(s);
  });

  function toggleRole(r, on) {
    setRoles((cur) => {
      const next = new Set(cur);
      on ? next.add(r) : next.delete(r);
      return next;
    });
  }
  function toggleUser(id, on) {
    setUsers((cur) => {
      const next = new Set(cur);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await saveTabGrants(tabKey, [...roles], [...users, ...hidden]);
      await refresh();
      onClose();
    } catch (e) {
      setErr("Couldn't save: " + (e.message || e));
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Who can see this tab</h2>
      {roles === null && !err ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div className="su-h">Roles</div>
          <div className="ta-roles">
            <Toggle label="Admins" checked disabled note="always" />
            {ROLE_TOGGLES.map(([r, label]) => (
              <Toggle key={r} label={label} checked={!!roles?.has(r)} onChange={(on) => toggleRole(r, on)} />
            ))}
          </div>

          <div className="su-h" style={{ marginTop: 14 }}>People</div>
          <div className="field" style={{ marginBottom: 8 }}>
            <input type="search" placeholder="Search people" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ta-list" role="group" aria-label="People">
            {shown.map((p) => {
              const viaRole = p.role === "admin" || roles?.has(p.role);
              return (
                <label key={p.id} className="ta-person">
                  <input
                    type="checkbox"
                    checked={p.role === "admin" || users.has(p.id)}
                    disabled={p.role === "admin"}
                    onChange={(e) => toggleUser(p.id, e.target.checked)}
                  />
                  <span className="ta-name">{p.name}</span>
                  <span className="ta-email">{p.email}</span>
                  <span className="ta-role">
                    {(p.role || "").charAt(0).toUpperCase() + (p.role || "").slice(1)}
                    {viaRole && " · has access by role"}
                  </span>
                </label>
              );
            })}
            {!shown.length && <div className="ta-empty">No one matches “{q}”.</div>}
          </div>
        </>
      )}
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn" onClick={save} disabled={saving || roles === null}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

// Eye icon next to the refresh button; admins only.
export default function TabAccessButton({ tabKey }) {
  const { me } = useApp();
  const [open, setOpen] = useState(false);
  if (me?.role !== "admin") return null;
  return (
    <>
      <button type="button" className="btn sm ghost ix-refresh" title="Who can see this tab" aria-label="Who can see this tab" onClick={() => setOpen(true)}>
        <EyeIcon />
      </button>
      {/* Rendered at the page root so the header's right alignment doesn't apply. */}
      {open && createPortal(<AccessPanel tabKey={tabKey} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
