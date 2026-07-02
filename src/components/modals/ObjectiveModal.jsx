import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";

export default function ObjectiveModal({ onClose }) {
  const { activeUsers, me, createObjective } = useApp();
  const dlg = useDialog();
  const users = activeUsers();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quarter, setQuarter] = useState("2026-Q3");
  const [owner, setOwner] = useState(me.id);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return dlg.alert("Title required.");
    setBusy(true);
    try {
      await createObjective({
        title: title.trim(),
        description: description.trim(),
        quarter: quarter.trim(),
        owner_user_id: owner || null,
      });
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Add objective</h2>
      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qualitative, inspiring goal" />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Quarter</label>
          <input value={quarter} onChange={(e) => setQuarter(e.target.value)} />
        </div>
        <div className="field">
          <label>Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
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
