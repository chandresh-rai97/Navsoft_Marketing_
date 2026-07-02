import React from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useDialog } from "../components/Dialog.jsx";
import PageHead from "../components/PageHead.jsx";
import { ProjectDot } from "../components/TaskRow.jsx";
import { CONF_LABEL } from "../lib/logic.js";
import { pct } from "../lib/format.js";

export default function Settings() {
  const { db, me, uname, krProgress, isAdmin, deleteUser } = useApp();
  const modals = useModals();
  const dlg = useDialog();

  async function handleDelete(u) {
    const ok = await dlg.confirm(
      `Delete ${u.name} (${u.email})? This revokes their login and removes their account permanently. Their tasks stay but become unassigned.`
    );
    if (!ok) return;
    try {
      await deleteUser(u.id);
    } catch (e) {
      dlg.alert("Couldn't delete this user: " + (e.message || e));
    }
  }

  const explainAdd = () =>
    dlg.alert(
      "New teammates join by signing up on the login screen with their email and a password (Supabase Auth). " +
        "Once they've signed up they appear here, and you can set their role and workstream. " +
        "Creating accounts on their behalf needs the service key and is done from the Supabase dashboard."
    );

  return (
    <>
      <PageHead
        title="Admin Settings"
        sub="Manage people and roles, projects, and this quarter's Objectives & Key Results."
      />

      <div className="panel">
        <h2>
          People &amp; roles
          <button className="btn sm" onClick={explainAdd}>
            + Add person
          </button>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                <td>
                  {u.active ? (
                    <span className="tag st-done">active</span>
                  ) : (
                    <span className="tag st-cancelled">inactive</span>
                  )}
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn sm ghost" onClick={() => modals.openUser(u.id)}>
                    Edit
                  </button>
                  {isAdmin() && u.id !== me.id && (
                    <button
                      className="btn sm ghost"
                      style={{ color: "var(--red)", borderColor: "#eab9b9" }}
                      onClick={() => handleDelete(u)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isAdmin() && (
          <div className="hint" style={{ marginTop: 8 }}>
            Only admins see the Delete control. Deleting a user revokes their login completely.
          </div>
        )}
      </div>

      <div className="panel">
        <h2>
          Projects
          <button className="btn sm" onClick={() => modals.openProject(null)}>
            + Add project
          </button>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Lead</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {db.projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <ProjectDot projectId={p.id} />
                  {p.name}
                </td>
                <td>{uname(p.lead_user_id)}</td>
                <td>{p.status}</td>
                <td>
                  <button className="btn sm ghost" onClick={() => modals.openProject(p.id)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {db.projects.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty">No projects yet — add your first workstream.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>
          Objectives &amp; Key Results
          <button className="btn sm" onClick={modals.openObjective}>
            + Objective
          </button>
        </h2>
        {db.objectives.map((o) => (
          <div
            key={o.id}
            style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "11px 13px", marginBottom: 9 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{o.title}</strong>
              <span>
                <button className="btn sm ghost" onClick={() => modals.openKR(o.id)}>
                  + KR
                </button>
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", margin: "3px 0 8px" }}>{o.quarter}</div>
            {db.keyResults.filter((k) => k.objective_id === o.id).length ? (
              db.keyResults
                .filter((k) => k.objective_id === o.id)
                .map((k) => (
                  <div className="mini" key={k.id}>
                    <span>{k.title}</span>
                    <span className={"conf-" + k.confidence}>
                      {pct(krProgress(k))}% · {CONF_LABEL[k.confidence]}
                    </span>
                  </div>
                ))
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>No KRs yet.</div>
            )}
          </div>
        ))}
        {db.objectives.length === 0 && (
          <div className="empty">No objectives yet — define this quarter's goals.</div>
        )}
      </div>

      <div className="panel">
        <h2>Data & seed</h2>
        <div className="sub">
          Demo data is loaded by running <code>supabase/seed.sql</code> in the Supabase SQL editor. To wipe and
          reload, re-run the schema and seed from the dashboard. This keeps auth accounts and RLS consistent.
        </div>
      </div>
    </>
  );
}
