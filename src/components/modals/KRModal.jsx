import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";
import { CONF, CONF_LABEL } from "../../lib/logic.js";

export default function KRModal({ objId, onClose }) {
  const { activeUsers, me, createKR } = useApp();
  const dlg = useDialog();
  const users = activeUsers();
  const [f, setF] = useState({
    title: "",
    owner_user_id: me.id,
    metric_unit: "",
    start_value: 0,
    target_value: 100,
    current_value: 0,
    kr_type: "committed",
    confidence: "on_track",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.title.trim()) return dlg.alert("Title required.");
    setBusy(true);
    try {
      await createKR({
        objective_id: objId,
        title: f.title.trim(),
        owner_user_id: f.owner_user_id || null,
        metric_unit: f.metric_unit.trim(),
        start_value: Number(f.start_value),
        target_value: Number(f.target_value),
        current_value: Number(f.current_value),
        kr_type: f.kr_type,
        confidence: f.confidence,
      });
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Add Key Result</h2>
      <div className="field">
        <label>Title (measurable)</label>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Grow signups 200 → 500" />
      </div>
      <div className="row2">
        <div className="field">
          <label>Owner</label>
          <select value={f.owner_user_id} onChange={(e) => set("owner_user_id", e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Unit</label>
          <input value={f.metric_unit} onChange={(e) => set("metric_unit", e.target.value)} placeholder="signups, %, $" />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Start</label>
          <input type="number" value={f.start_value} onChange={(e) => set("start_value", e.target.value)} />
        </div>
        <div className="field">
          <label>Target</label>
          <input type="number" value={f.target_value} onChange={(e) => set("target_value", e.target.value)} />
        </div>
        <div className="field">
          <label>Current</label>
          <input type="number" value={f.current_value} onChange={(e) => set("current_value", e.target.value)} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Type</label>
          <select value={f.kr_type} onChange={(e) => set("kr_type", e.target.value)}>
            <option value="committed">committed</option>
            <option value="stretch">stretch</option>
          </select>
        </div>
        <div className="field">
          <label>Confidence</label>
          <select value={f.confidence} onChange={(e) => set("confidence", e.target.value)}>
            {CONF.map((c) => (
              <option key={c} value={c}>
                {CONF_LABEL[c]}
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
