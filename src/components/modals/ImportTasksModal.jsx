import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { parseCSVObjects } from "../../lib/csv.js";

const TEMPLATE_HEADERS =
  "Task ID,Title,Description,Project,Key Result,Assignee Email,Due Date,Status,Recurrence";
const TEMPLATE_EXAMPLE =
  ",Write launch blog post,Draft and publish,SEO,Grow organic signups 200 → 500,neha@team.com,2026-07-10,In progress,None";

export default function ImportTasksModal({ onClose }) {
  const { importTasks } = useApp();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  function onFile(e) {
    setParseError("");
    setSummary(null);
    setRows(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows: objs } = parseCSVObjects(String(reader.result || ""));
        if (!objs.length) {
          setParseError("That file has a header row but no task rows under it.");
          return;
        }
        if (!headers.some((h) => h.replace(/\s+/g, "").toLowerCase() === "title")) {
          setParseError(
            "Couldn't find a 'Title' column. Make sure the first row is the column headers."
          );
          return;
        }
        setRows(objs);
      } catch (err) {
        setParseError("Couldn't read that file as a CSV: " + (err.message || err));
      }
    };
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function runImport() {
    setBusy(true);
    try {
      const res = await importTasks(rows);
      setSummary(res);
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_HEADERS + "\n" + TEMPLATE_EXAMPLE + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cadence-import-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal onClose={onClose} wide>
      <h2>Import from spreadsheet</h2>

      {!summary && (
        <>
          <div className="note">
            Upload a CSV exported from Google Sheets (File → Download → Comma-separated values).
            The first row must be the column headers.
          </div>

          <div className="field">
            <label>Columns (in any order)</label>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              <strong>Task ID</strong> (leave blank to create a new task; fill in to update an
              existing one), <strong>Title</strong>, <strong>Description</strong>,{" "}
              <strong>Project</strong> (matched by name), <strong>Key Result</strong> (matched by
              title), <strong>Assignee Email</strong> (matched to a user), <strong>Due Date</strong>{" "}
              (YYYY-MM-DD), <strong>Status</strong> (Not started / In progress / Blocked / Done),{" "}
              <strong>Recurrence</strong> (None / Daily / Weekly).
            </div>
            <button className="linkbtn" style={{ marginTop: 8 }} onClick={downloadTemplate}>
              Download a template CSV
            </button>
          </div>

          <div className="field">
            <label>Choose your CSV file</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            {fileName && !parseError && rows && (
              <div className="hint" style={{ color: "var(--green)" }}>
                {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"} ready to import.
              </div>
            )}
            {parseError && <div className="err" style={{ minHeight: 0 }}>{parseError}</div>}
          </div>

          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn accent" onClick={runImport} disabled={!rows || busy}>
              {busy ? "Importing…" : rows ? `Import ${rows.length} row${rows.length === 1 ? "" : "s"}` : "Import"}
            </button>
          </div>
        </>
      )}

      {summary && (
        <>
          <div className="cards" style={{ marginBottom: 14 }}>
            <div className="stat">
              <div className="n">{summary.created}</div>
              <div className="l">Created</div>
            </div>
            <div className="stat">
              <div className="n">{summary.updated}</div>
              <div className="l">Updated</div>
            </div>
            <div className={"stat" + (summary.skipped.length ? " warn" : "")}>
              <div className="n">{summary.skipped.length}</div>
              <div className="l">Skipped</div>
            </div>
          </div>

          {summary.skipped.length > 0 ? (
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Skipped rows — nothing was changed for these</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Sheet row</th>
                    <th>Why it was skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.skipped.map((s, i) => (
                    <tr key={i}>
                      <td>Row {s.row}</td>
                      <td>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="note">Every row imported cleanly — no rows were skipped.</div>
          )}

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
