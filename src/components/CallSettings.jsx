import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useDialog } from "./Dialog.jsx";
import { CATEGORIES, saveOutcomes, saveProducts } from "../lib/coldCalling.js";

const inputStyle = { padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7, fontSize: 12.5, width: "100%" };

// Admin Settings: which group each call outcome counts in, and which campaign-
// name keywords mean which product, for the Cold Calling Activity tab.
export default function CallSettings() {
  const dlg = useDialog();
  const [outcomes, setOutcomes] = useState(null);
  const [products, setProducts] = useState(null);
  const [saving, setSaving] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const [o, p] = await Promise.all([
      supabase.from("call_outcomes").select("outcome,category").order("category").order("outcome"),
      supabase.from("campaign_products").select("keyword,product").order("keyword"),
    ]);
    if (o.error || p.error) {
      setErr((o.error || p.error).message);
      setOutcomes([]);
      setProducts([]);
      return;
    }
    setOutcomes(o.data.map((x) => ({ ...x })));
    setProducts(p.data.map((x) => ({ ...x })));
    setErr("");
  }
  useEffect(() => {
    load();
  }, []);

  const edit = (set) => (i, k, v) => set((list) => list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const editOutcome = edit(setOutcomes);
  const editProduct = edit(setProducts);

  async function save(which) {
    setSaving(which);
    try {
      if (which === "outcomes") await saveOutcomes(outcomes);
      else await saveProducts(products);
      await load();
    } catch (e) {
      dlg.alert("Couldn't save: " + (e.message || e));
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="panel">
      <h2>Cold calling</h2>
      <div className="sub" style={{ marginBottom: 10 }}>
        Settings for the Cold Calling Activity tab. Outcome names must match the sheet exactly. Changes show the next time the tab loads.
      </div>
      {err && <div className="err">{err}</div>}
      {outcomes === null ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div className="su-h">Call outcomes</div>
          <table>
            <thead>
              <tr><th>Outcome (as in the sheet)</th><th>Counts as</th><th></th></tr>
            </thead>
            <tbody>
              {outcomes.map((o, i) => (
                <tr key={i}>
                  <td><input style={inputStyle} value={o.outcome} aria-label="Outcome" onChange={(e) => editOutcome(i, "outcome", e.target.value)} /></td>
                  <td>
                    <select style={inputStyle} value={o.category} aria-label="Counts as" onChange={(e) => editOutcome(i, "category", e.target.value)}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td><button className="btn sm ghost" onClick={() => setOutcomes((l) => l.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn sm ghost" onClick={() => setOutcomes((l) => [...l, { outcome: "", category: "Not connected" }])}>+ Add outcome</button>
            <button className="btn sm" disabled={saving === "outcomes"} onClick={() => save("outcomes")}>
              {saving === "outcomes" ? "Saving…" : "Save outcomes"}
            </button>
          </div>

          <div className="su-h" style={{ marginTop: 18 }}>Products in campaign names</div>
          <div className="hint" style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
            A campaign name that starts with a keyword gets that product. Names that start with no keyword count as events.
          </div>
          <table>
            <thead>
              <tr><th>Keyword (start of the name)</th><th>Product</th><th></th></tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={i}>
                  <td><input style={inputStyle} value={p.keyword} aria-label="Keyword" onChange={(e) => editProduct(i, "keyword", e.target.value)} /></td>
                  <td><input style={inputStyle} value={p.product} aria-label="Product" onChange={(e) => editProduct(i, "product", e.target.value)} /></td>
                  <td><button className="btn sm ghost" onClick={() => setProducts((l) => l.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn sm ghost" onClick={() => setProducts((l) => [...l, { keyword: "", product: "" }])}>+ Add product</button>
            <button className="btn sm" disabled={saving === "products"} onClick={() => save("products")}>
              {saving === "products" ? "Saving…" : "Save products"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
