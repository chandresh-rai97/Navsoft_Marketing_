import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";
import { ROLES } from "../../lib/logic.js";

// Edit an existing profile's name / role / active flag. New teammates join by
// signing up (Supabase Auth) — creating auth users needs the service key and
// can't happen from the browser, so there is no "add" path here.
export default function UserModal({ id, onClose }) {
  const { U, me, updateUser } = useApp();
  const dlg = useDialog();
  const u = U(id);
  const [name, setName] = useState(u?.name || "");
  const [role, setRole] = useState(u?.role || "member");
  const [active, setActive] = useState(u ? u.active : true);
  const [busy, setBusy] = useState(false);
  if (!u) return null;

  async function save() {
    if (!name.trim()) return dlg.alert("Name is required.");
    if (u.id === me.id && !active) return dlg.alert("You can't deactivate yourself.");
    setBusy(true);
    try {
      await updateUser(u.id, { name: name.trim(), role, active });
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Edit person</h2>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Email (login)</label>
        <input value={u.email} disabled />
        <div className="hint">Login email is managed by Supabase Auth and can't be changed here.</div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
