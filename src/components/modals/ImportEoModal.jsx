import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { parseCSVObjects, downloadText } from "../../lib/csv.js";

const HEADERS = "Channel,Section,Metric,Unit,Direction,Carry?,Period,Base Target,Achieved";
const EXAMPLE = [
  "Social Media,Effort,Posts published,#,Higher,Yes,Aug 2026,15,13",
  "Social Media,Outcome,Engagement rate,%,Higher,No,Aug 2026,5,4.3",
  "Social Media,Effort,Posts published,#,Higher,Yes,Aug 2026 Week 1,4,3",
].join("\n");

export default function ImportEoModal({ onClose }) {
  const { importEoData } = useApp();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  function onFile(e) {
    setErr("");
    setSummary(null);
    setRows(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows: objs } = parseCSVObjects(String(reader.result || ""));
        if (!objs.length) return setErr("That file has a header row but no data rows.");
        if (!headers.some((h) => h.replace(/\s+/g, "").toLowerCase() === "metric"))
          return setErr("Couldn't find a 'Metric' column — make sure the first row is the headers.");
        setRows(objs);
      } catch (e2) {
        setErr("Couldn't read that file as CSV: " + (e2.message || e2));
      }
    };
    reader.onerror = () => setErr("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function run() {
    setBusy(true);
    try {
      setSummary(await importEoData(rows));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h2>Import data</h2>
      {!summary && (
        <>
          <div className="note">
            Upload a CSV with columns: <strong>Channel, Section, Metric, Unit, Direction, Carry?, Period, Base
            Target, Achieved</strong>. Period can be a month (<em>Aug 2026</em>) or a week (<em>Aug 2026 Week 1</em>).
            For % metrics enter the percentage number (25 = 25%). Only Base Target and Achieved are imported — the
            calculated columns are never touched. Metrics that don't exist yet are created from Unit/Direction/Carry?.
          </div>
          <div className="field">
            <button className="linkbtn" onClick={() => downloadText("efforts-vs-outcome-import-template.csv", HEADERS + "\n" + EXAMPLE + "\n")}>
              Download a template CSV
            </button>
          </div>
          <div className="field">
            <label>Choose your CSV file</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            {rows && !err && <div className="hint" style={{ color: "var(--green)" }}>{fileName} — {rows.length} row{rows.length === 1 ? "" : "s"} ready.</div>}
            {err && <div className="err" style={{ minHeight: 0 }}>{err}</div>}
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn accent" onClick={run} disabled={!rows || busy}>
              {busy ? "Importing…" : rows ? `Import ${rows.length} row${rows.length === 1 ? "" : "s"}` : "Import"}
            </button>
          </div>
        </>
      )}
      {summary && (
        <>
          <div className="cards" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="n">{summary.created}</div><div className="l">Added</div></div>
            <div className="stat"><div className="n">{summary.updated}</div><div className="l">Updated</div></div>
            <div className={"stat" + (summary.skipped.length ? " warn" : "")}><div className="n">{summary.skipped.length}</div><div className="l">Skipped</div></div>
          </div>
          {summary.skipped.length > 0 ? (
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Skipped rows — nothing was changed for these</h2>
              <table>
                <thead><tr><th style={{ width: 90 }}>Row</th><th>Why</th></tr></thead>
                <tbody>{summary.skipped.map((s, i) => (<tr key={i}><td>Row {s.row}</td><td>{s.reason}</td></tr>))}</tbody>
              </table>
            </div>
          ) : (
            <div className="note">Every row imported cleanly.</div>
          )}
          <div className="modal-actions"><button className="btn" onClick={onClose}>Done</button></div>
        </>
      )}
    </Modal>
  );
}
