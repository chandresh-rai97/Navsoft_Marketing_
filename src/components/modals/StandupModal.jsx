import React, { useMemo, useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { OPEN_STATUSES } from "../../lib/logic.js";

export default function StandupModal({ onClose }) {
  const { db, me, pname, isOverdue, submitStandup } = useApp();

  const review = useMemo(
    () =>
      db.tasks
        .filter((x) => x.assignee_user_id === me.id && OPEN_STATUSES.includes(x.status))
        .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a))),
    [db.tasks, me.id, isOverdue]
  );

  const [doneIds, setDoneIds] = useState({});
  const [newTitles, setNewTitles] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [blockerText, setBlockerText] = useState("");
  const [busy, setBusy] = useState(false);

  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });

  async function submit() {
    setBusy(true);
    try {
      await submitStandup({
        doneIds: Object.keys(doneIds).filter((k) => doneIds[k]),
        newTitles,
        blockerText: blockerText.trim(),
      });
      onClose();
    } catch (e) {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h2>Daily standup — {weekday}</h2>
      <div className="note">
        Tick what you finished. Anything left unticked auto-carries to today with a counter, so
        nothing disappears silently.
      </div>

      <div className="field">
        <label>Yesterday / open — done?</label>
        {review.length ? (
          review.map((x) => (
            <label
              key={x.id}
              className="dod-item"
              style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}
            >
              <input
                type="checkbox"
                checked={!!doneIds[x.id]}
                onChange={(e) => setDoneIds((d) => ({ ...d, [x.id]: e.target.checked }))}
              />
              <span style={{ flex: 1 }}>
                {x.title}{" "}
                {isOverdue(x) && <span className="warnflag">overdue</span>}{" "}
                {x.carry_forward_count > 0 && <span className="warnflag">↻{x.carry_forward_count}</span>}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{pname(x.project_id)}</span>
            </label>
          ))
        ) : (
          <div className="empty">Nothing outstanding. Fresh start.</div>
        )}
      </div>

      <div className="field">
        <label>Today's plan</label>
        <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>
          Unticked items above stay on today automatically. Add anything new below.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Add a task for today"
            value={newTitle}
            style={{ flex: 1 }}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                setNewTitles((a) => [...a, newTitle.trim()]);
                setNewTitle("");
              }
            }}
          />
          <button
            className="btn sm ghost"
            onClick={() => {
              if (!newTitle.trim()) return;
              setNewTitles((a) => [...a, newTitle.trim()]);
              setNewTitle("");
            }}
          >
            Add
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          {newTitles.map((x, i) => (
            <div className="dod-item" key={i}>
              <span style={{ flex: 1 }}>＋ {x}</span>
              <span
                className="danger-link"
                onClick={() => setNewTitles((a) => a.filter((_, j) => j !== i))}
              >
                remove
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Blockers (optional)</label>
        <textarea
          placeholder="Anything blocking you, and who could help?"
          value={blockerText}
          onChange={(e) => setBlockerText(e.target.value)}
        />
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn accent" onClick={submit} disabled={busy}>
          {busy ? "Submitting…" : "Submit standup"}
        </button>
      </div>
    </Modal>
  );
}
