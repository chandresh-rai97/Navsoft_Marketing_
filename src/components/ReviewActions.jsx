import React, { useState } from "react";
import { useApp } from "../context/AppData.jsx";
import { useDialog } from "./Dialog.jsx";
import { todayStr, shiftStr, fmtDate } from "../lib/format.js";

// Reviewer controls for a submitted task: see the proof link, then Accept
// (marks Done) or Request changes (with a "Resubmit by" date + optional note).
// Also renders the review outcome (note / resubmit date) as read-only info.
export default function ReviewActions({ task, onDone }) {
  const { canReview, acceptReview, requestChanges, uname } = useApp();
  const dlg = useDialog();
  const [mode, setMode] = useState(null); // null | "changes"
  const [resubmitBy, setResubmitBy] = useState(shiftStr(todayStr(), 3));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reviewable = canReview(task) && task.status === "done_pending_acceptance";

  async function accept() {
    setBusy(true);
    const r = await acceptReview(task.id);
    setBusy(false);
    if (r && r.ok === false) return dlg.alert(r.message);
    onDone && onDone();
  }

  async function sendBack() {
    if (!resubmitBy) return dlg.alert("Pick a 'Resubmit by' date.");
    setBusy(true);
    const r = await requestChanges(task.id, resubmitBy, note.trim());
    setBusy(false);
    if (r && r.ok === false) return dlg.alert(r.message);
    onDone && onDone();
  }

  return (
    <div className="panel" style={{ background: "var(--paper-2)", marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, marginBottom: reviewable ? 10 : 0 }}>
        <strong>Task proof:</strong>{" "}
        {task.proof_link ? (
          <a href={task.proof_link} target="_blank" rel="noreferrer">
            {task.proof_link}
          </a>
        ) : (
          <span style={{ color: "var(--muted)" }}>none submitted</span>
        )}
      </div>

      {task.status === "changes_requested" && (
        <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 6 }}>
          Changes requested{task.resubmit_by ? ` — resubmit by ${fmtDate(task.resubmit_by)}` : ""}
          {task.review_note ? ` · “${task.review_note}”` : ""}
        </div>
      )}

      {reviewable &&
        (mode === "changes" ? (
          <>
            <div className="row2">
              <div className="field">
                <label>Resubmit by</label>
                <input type="date" value={resubmitBy} onChange={(e) => setResubmitBy(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Note (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setMode(null)}>Back</button>
              <button className="btn" onClick={sendBack} disabled={busy}>
                {busy ? "…" : "Send back"}
              </button>
            </div>
          </>
        ) : (
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <div style={{ flex: 1, fontSize: 11.5, color: "var(--muted)" }}>
              Submitted by {uname(task.assignee_user_id)} — accept to mark Done.
            </div>
            <button className="btn ghost" onClick={() => setMode("changes")}>Request changes</button>
            <button className="btn accent" onClick={accept} disabled={busy}>
              {busy ? "…" : "Accept (mark Done)"}
            </button>
          </div>
        ))}
    </div>
  );
}
