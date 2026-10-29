import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useDialog } from "./Dialog.jsx";
import { UNMAPPED, byRegion } from "../lib/instantly.js";

const NEW = "__new__";

// Admin Settings: Instantly campaign-name tags with no region yet. Assigning a
// region adds the tag to region_aliases (via an admin-only database function)
// and re-derives every campaign's region.
export default function InstantlyTags() {
  const dlg = useDialog();
  const [tags, setTags] = useState(null);
  const [regions, setRegions] = useState([]);
  const [pick, setPick] = useState({});
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    const [c, a] = await Promise.all([
      supabase.from("instantly_campaigns").select("name,region").like("region", "%" + UNMAPPED),
      supabase.from("region_aliases").select("region"),
    ]);
    if (c.error || a.error) {
      setErr((c.error || a.error).message);
      setTags([]);
      return;
    }
    const groups = new Map();
    c.data.forEach((row) => {
      const tag = row.region.slice(0, -UNMAPPED.length);
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(row.name);
    });
    setTags(Array.from(groups, ([tag, names]) => ({ tag, names })).sort((x, y) => x.tag.localeCompare(y.tag)));
    setRegions(Array.from(new Set(a.data.map((r) => r.region))).sort(byRegion));
    setErr("");
  }
  useEffect(() => {
    load();
  }, []);

  async function save(tag) {
    let region = pick[tag];
    if (!region) return;
    if (region === NEW) {
      region = await dlg.prompt(`Name of the new region for the tag "(${tag})"`);
      if (!region || !region.trim()) return;
    }
    setSaving(tag);
    const { error } = await supabase.rpc("instantly_map_tag", { p_tag: tag, p_region: region.trim() });
    setSaving(null);
    if (error) {
      dlg.alert("Couldn't save this mapping: " + error.message);
      return;
    }
    await load();
  }

  return (
    <div className="panel">
      <h2>Instantly region tags</h2>
      <div className="sub" style={{ marginBottom: 10 }}>
        Campaign names carry a region tag in brackets, like <code>(India)</code>. These tags aren't mapped to a region
        yet, so the Campaigns tab shows them as "unmapped". Pick a region to fix every campaign with that tag.
      </div>
      {err && <div className="err">{err}</div>}
      {tags === null ? (
        <div className="loading">Loading…</div>
      ) : tags.length === 0 ? (
        <div className="empty">No unmapped tags. Every campaign has a known region or no tag at all.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Campaigns</th>
              <th>Region</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tags.map(({ tag, names }) => (
              <tr key={tag}>
                <td><code>({tag})</code></td>
                <td title={names.join("\n")}>
                  {names.length} · <span style={{ color: "var(--muted)" }}>{names[0]}{names.length > 1 ? "…" : ""}</span>
                </td>
                <td>
                  <select
                    value={pick[tag] || ""}
                    onChange={(e) => setPick((p) => ({ ...p, [tag]: e.target.value }))}
                    style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7, fontSize: 12.5 }}
                  >
                    <option value="">Choose region…</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    <option value={NEW}>New region…</option>
                  </select>
                </td>
                <td>
                  <button className="btn sm" disabled={!pick[tag] || saving === tag} onClick={() => save(tag)}>
                    {saving === tag ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
