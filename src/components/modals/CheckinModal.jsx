import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { CONF, CONF_LABEL } from "../../lib/logic.js";

export default function CheckinModal({ krId, onClose }) {
  const { KR, saveCheckin } = useApp();
  const k = KR(krId);
  const [val, setVal] = useState(k?.current_value ?? 0);
  const [conf, setConf] = useState(k?.confidence || "on_track");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!k) return null;

  async function save() {
    setBusy(true);
    try {
      await saveCheckin(krId, { current_value: Number(val), confidence: conf, note });
      onClose();
    } catch (e) {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Weekly check-in — {k.title}</h2>
      <div className="row2">
        <div className="field">
          <label>Current value ({k.metric_unit})</label>
          <input type="number" value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        <div className="field">
          <label>Confidence</label>
          <select value={conf} onChange={(e) => setConf(e.target.value)}>
            {CONF.map((c) => (
              <option key={c} value={c}>
                {CONF_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>One-line note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed this week?" />
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save check-in"}
        </button>
      </div>
    </Modal>
  );
}
