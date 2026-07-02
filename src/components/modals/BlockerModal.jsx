import React, { useMemo, useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";
import { OPEN_STATUSES } from "../../lib/logic.js";

export default function BlockerModal({ onClose }) {
  const { db, me, activeUsers, createBlocker } = useApp();
  const dlg = useDialog();
  const myTasks = useMemo(
    () => db.tasks.filter((t) => t.assignee_user_id === me.id && OPEN_STATUSES.includes(t.status)),
    [db.tasks, me.id]
  );
  const [desc, setDesc] = useState("");
  const [taskId, setTaskId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!desc.trim()) return dlg.alert("Describe the blocker.");
    setBusy(true);
    try {
      await createBlocker({
        description: desc.trim(),
        task_id: taskId || null,
        owner_user_id: ownerId || null,
      });
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't raise blocker: " + (e.message || e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Raise a blocker</h2>
      <div className="field">
        <label>What's blocking you?</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Describe the blocker and what would unblock it"
        />
      </div>
      <div className="row2">
        <div className="field">
          <label>Related task (optional)</label>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">— none —</option>
            {myTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Who could help? (optional)</label>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">— unassigned —</option>
            {activeUsers().map((u) => (
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
          {busy ? "…" : "Raise blocker"}
        </button>
      </div>
    </Modal>
  );
}
