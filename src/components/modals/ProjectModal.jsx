import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";

const COLORS = ["#0f7b6c", "#2f6db3", "#6b4fa3", "#c8790f", "#b23a3a", "#4a5568"];

export default function ProjectModal({ id, onClose }) {
  const { P, activeUsers, createProject, updateProject } = useApp();
  const dlg = useDialog();
  const p = id ? P(id) : null;
  const users = activeUsers();
  const [name, setName] = useState(p?.name || "");
  const [description, setDescription] = useState(p?.description || "");
  const [lead, setLead] = useState(p?.lead_user_id || users[0]?.id || "");
  const [color, setColor] = useState(p?.color || COLORS[0]);
  const [status, setStatus] = useState(p?.status || "active");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return dlg.alert("Name is required.");
    setBusy(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        lead_user_id: lead || null,
        color,
      };
      if (p) await updateProject(p.id, { ...data, status });
      else await createProject({ ...data, status: "active" });
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>{p ? "Edit project" : "Add project"}</h2>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Paid Social" />
      </div>
      <div className="field">
        <label>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Lead</label>
          <select value={lead} onChange={(e) => setLead(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Colour</label>
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {p && (
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}
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
