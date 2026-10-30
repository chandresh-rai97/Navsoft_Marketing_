import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useDialog } from "./Dialog.jsx";
import { saveAlertSettings, savePeople } from "../lib/hubspot.js";

const inputStyle = { padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7, fontSize: 12.5, width: "100%" };

// Admin Settings: neglected-deal alert stages and threshold, and the people
// allowlist for the HubSpot Team Activity tab. Saved through admin-only
// database functions; changes apply at the next refresh.
export default function HubSpotSettings() {
  const dlg = useDialog();
  const [threshold, setThreshold] = useState(10);
  const [stages, setStages] = useState(null);
  const [people, setPeople] = useState(null);
  const [savedPeople, setSavedPeople] = useState([]);
  const [saving, setSaving] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const [s, p] = await Promise.all([
      supabase.from("hubspot_alert_settings").select("threshold_days,stages").eq("id", 1).maybeSingle(),
      supabase.from("hubspot_people").select("owner_id,name,active").order("name"),
    ]);
    if (s.error || p.error) {
      setErr((s.error || p.error).message);
      setStages([]);
      setPeople([]);
      return;
    }
    setThreshold(s.data?.threshold_days ?? 10);
    setStages((s.data?.stages ?? []).map((x) => ({ id: x.id, label: x.label })));
    setPeople(p.data.map((x) => ({ ...x })));
    setSavedPeople(p.data);
    setErr("");
  }
  useEffect(() => {
    load();
  }, []);

  const editStage = (i, k, v) => setStages((list) => list.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const editPerson = (i, k, v) => setPeople((list) => list.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function saveAlerts() {
    setSaving("alerts");
    try {
      await saveAlertSettings(Number(threshold), stages);
      await load();
    } catch (e) {
      dlg.alert("Couldn't save the alert settings: " + (e.message || e));
    } finally {
      setSaving("");
    }
  }

  async function saveList() {
    const keep = new Set(people.filter((p) => p.active).map((p) => String(p.owner_id).trim()));
    const losing = savedPeople.filter((p) => p.active && !keep.has(p.owner_id));
    if (losing.length) {
      const ok = await dlg.confirm(
        `Saving removes the synced HubSpot records of ${losing.map((p) => p.name).join(", ")}. Continue?`
      );
      if (!ok) return;
    }
    setSaving("people");
    try {
      await savePeople(people.map((p) => ({ owner_id: String(p.owner_id).trim(), name: p.name, active: p.active })));
      await load();
    } catch (e) {
      dlg.alert("Couldn't save the people list: " + (e.message || e));
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="panel">
      <h2>HubSpot</h2>
      <div className="sub" style={{ marginBottom: 10 }}>
        Settings for the HubSpot Team Activity tab. Changes apply at the next refresh.
      </div>
      {err && <div className="err">{err}</div>}
      {stages === null ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div className="su-h">Neglected-deal alert</div>
          <table>
            <thead>
              <tr>
                <th>Stage ID in HubSpot</th>
                <th>Stage name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s, i) => (
                <tr key={i}>
                  <td><input style={inputStyle} value={s.id} aria-label="Stage ID" onChange={(e) => editStage(i, "id", e.target.value)} /></td>
                  <td><input style={inputStyle} value={s.label} aria-label="Stage name" onChange={(e) => editStage(i, "label", e.target.value)} /></td>
                  <td>
                    <button className="btn sm ghost" onClick={() => setStages((l) => l.filter((_, j) => j !== i))}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn sm ghost" onClick={() => setStages((l) => [...l, { id: "", label: "" }])}>+ Add stage</button>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
              Alert after
              <input type="number" min="1" max="365" value={threshold} aria-label="Threshold days"
                style={{ ...inputStyle, width: 70 }} onChange={(e) => setThreshold(e.target.value)} />
              days without contact
            </label>
            <button className="btn sm" disabled={saving === "alerts"} onClick={saveAlerts}>
              {saving === "alerts" ? "Saving…" : "Save alert settings"}
            </button>
          </div>

          <div className="su-h" style={{ marginTop: 18 }}>People</div>
          <div className="hint" style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
            Only these HubSpot owners (plus records with no owner) are synced and shown. Removing or deactivating
            someone deletes their synced records.
          </div>
          <table>
            <thead>
              <tr>
                <th>HubSpot owner ID</th>
                <th>Name</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p, i) => (
                <tr key={i}>
                  <td><input style={inputStyle} value={p.owner_id} inputMode="numeric" aria-label="HubSpot owner ID" onChange={(e) => editPerson(i, "owner_id", e.target.value)} /></td>
                  <td><input style={inputStyle} value={p.name} aria-label="Name" onChange={(e) => editPerson(i, "name", e.target.value)} /></td>
                  <td><input type="checkbox" checked={p.active} aria-label="Active" onChange={(e) => editPerson(i, "active", e.target.checked)} /></td>
                  <td>
                    <button className="btn sm ghost" onClick={() => setPeople((l) => l.filter((_, j) => j !== i))}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn sm ghost" onClick={() => setPeople((l) => [...l, { owner_id: "", name: "", active: true }])}>+ Add person</button>
            <button className="btn sm" disabled={saving === "people"} onClick={saveList}>
              {saving === "people" ? "Saving…" : "Save people"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
