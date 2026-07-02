import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";

// Quarter-end: set final_score (0.0–1.0) and retro notes for a KR.
export default function ScoreModal({ krId, onClose }) {
  const { KR, scoreKR } = useApp();
  const dlg = useDialog();
  const k = KR(krId);
  const [score, setScore] = useState(k?.final_score ?? 0.7);
  const [notes, setNotes] = useState(k?.retro_notes || "");
  const [busy, setBusy] = useState(false);
  if (!k) return null;

  async function save() {
    const s = Number(score);
    if (Number.isNaN(s) || s < 0 || s > 1) return dlg.alert("Score must be between 0.0 and 1.0.");
    setBusy(true);
    try {
      await scoreKR(krId, { final_score: s, retro_notes: notes.trim() });
      onClose();
    } catch (e) {
      setBusy(false);
      dlg.alert("Couldn't save: " + (e.message || e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Score KR — {k.title}</h2>
      <div className="field">
        <label>Final score (0.0 – 1.0)</label>
        <input type="number" step="0.1" min="0" max="1" value={score} onChange={(e) => setScore(e.target.value)} />
        <div className="hint">0.7+ is typically "achieved" for a committed KR; stretch KRs grade more leniently.</div>
      </div>
      <div className="field">
        <label>Retro notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What worked, what didn't, what carries forward?" />
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save score"}
        </button>
      </div>
    </Modal>
  );
}
