import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { useApp } from "../../context/AppData.jsx";
import { useDialog } from "../Dialog.jsx";

function SectionEditor({ section, projectId }) {
  const { db, eoAddMetric, eoUpdateMetric, eoDeleteMetric } = useApp();
  const dlg = useDialog();
  const rows = db.eoMetrics
    .filter((m) => m.project_id === projectId && m.section === section)
    .sort((a, b) => a.position - b.position || (a.created_at || "").localeCompare(b.created_at || ""));

  const [nw, setNw] = useState({ name: "", unit: "#", direction: "higher", carry: "yes" });

  async function add() {
    if (!nw.name.trim()) return dlg.alert("Give the metric a name.");
    const pos = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
    await eoAddMetric(projectId, {
      section,
      name: nw.name.trim(),
      unit: nw.unit.trim(),
      direction: nw.direction,
      carry: nw.carry === "yes",
      position: pos,
    });
    setNw({ name: "", unit: "#", direction: "higher", carry: "yes" });
  }

  async function remove(m) {
    if (await dlg.confirm(`Remove "${m.name}" and all its monthly values? This can't be undone.`)) {
      await eoDeleteMetric(m.id);
    }
  }

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <h2>{section === "effort" ? "EFFORT metrics" : "OUTCOME metrics"}</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Unit</th>
            <th>Direction</th>
            <th>Carry?</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>
                <input
                  defaultValue={m.name}
                  key={m.name}
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.name && eoUpdateMetric(m.id, { name: e.target.value.trim() })}
                />
              </td>
              <td>
                <input
                  defaultValue={m.unit}
                  key={m.unit}
                  style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
                  onBlur={(e) => e.target.value.trim() !== m.unit && eoUpdateMetric(m.id, { unit: e.target.value.trim() })}
                />
              </td>
              <td>
                <select value={m.direction} onChange={(e) => eoUpdateMetric(m.id, { direction: e.target.value })}>
                  <option value="higher">Higher</option>
                  <option value="lower">Lower</option>
                </select>
              </td>
              <td>
                <select value={m.carry ? "yes" : "no"} onChange={(e) => eoUpdateMetric(m.id, { carry: e.target.value === "yes" })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </td>
              <td>
                <button className="danger-link" onClick={() => remove(m)}>remove</button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input
                placeholder="New metric name"
                value={nw.name}
                style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
                onChange={(e) => setNw({ ...nw, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </td>
            <td>
              <input
                value={nw.unit}
                style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
                onChange={(e) => setNw({ ...nw, unit: e.target.value })}
              />
            </td>
            <td>
              <select value={nw.direction} onChange={(e) => setNw({ ...nw, direction: e.target.value })}>
                <option value="higher">Higher</option>
                <option value="lower">Lower</option>
              </select>
            </td>
            <td>
              <select value={nw.carry} onChange={(e) => setNw({ ...nw, carry: e.target.value })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </td>
            <td>
              <button className="btn sm" onClick={add}>Add</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function EoRowsModal({ projectId, onClose }) {
  const { P } = useApp();
  const p = P(projectId);
  return (
    <Modal onClose={onClose} wide>
      <h2>Manage metrics — {p ? p.name : "channel"}</h2>
      <div className="sub" style={{ marginBottom: 12 }}>
        Add or remove rows in each section and set each metric's Unit, Direction (Higher = more is better,
        Lower = less is better) and Carry? (Yes = shortfall rolls into next month).
      </div>
      <SectionEditor section="effort" projectId={projectId} />
      <SectionEditor section="outcome" projectId={projectId} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
