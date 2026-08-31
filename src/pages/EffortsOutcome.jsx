import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useDialog } from "../components/Dialog.jsx";
import PageHead from "../components/PageHead.jsx";
import EoCell from "../components/EoCell.jsx";
import {
  computeChannel,
  channelMonthSummary,
  attainColor,
  fmtPct,
  fmtNum,
  monthLabel,
  monthAdd,
  currentMonthKey,
  allowedChannels,
} from "../lib/eo.js";

const CONFIG_COLS = [
  { key: "name", label: "Metric", w: 210 },
  { key: "unit", label: "Unit", w: 64 },
  { key: "direction", label: "Direction", w: 86 },
  { key: "carry", label: "Carry?", w: 66 },
];
const SUB_COLS = [
  { key: "base", label: "Base Target", calc: false },
  { key: "carried", label: "Carried In", calc: true },
  { key: "total", label: "Total Target", calc: true },
  { key: "achieved", label: "Achieved", calc: false },
  { key: "attain", label: "Attain %", calc: true },
  { key: "tocarry", label: "To Carry", calc: true },
];

function sortMetrics(metrics) {
  const rank = { effort: 0, outcome: 1 };
  return [...metrics].sort(
    (a, b) =>
      rank[a.section] - rank[b.section] ||
      a.position - b.position ||
      (a.created_at || "").localeCompare(b.created_at || "")
  );
}

function MonthFilter({ allMonths, from, to, setFrom, setTo }) {
  return (
    <div className="filters" style={{ marginBottom: 0 }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Months:</span>
      <select value={from} onChange={(e) => setFrom(e.target.value)}>
        {allMonths.map((m) => (
          <option key={m} value={m}>From {monthLabel(m)}</option>
        ))}
      </select>
      <select value={to} onChange={(e) => setTo(e.target.value)}>
        {allMonths.map((m) => (
          <option key={m} value={m}>To {monthLabel(m)}</option>
        ))}
      </select>
    </div>
  );
}

export default function EffortsOutcome() {
  const { db, isAdmin, isViewer, isProjectManager, uname, eoAddMonth, eoDeleteMonth, eoSaveEntry } = useApp();
  const modals = useModals();

  // exactly the four allowed channels (projects matched by name)
  const allChannels = useMemo(() => allowedChannels(db.projects), [db.projects]);
  const myChannels = useMemo(
    () => (isAdmin() || isViewer() ? allChannels : allChannels.filter((p) => isProjectManager(p.id))),
    [allChannels, db.users] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const canSeeDashboard = isAdmin() || isViewer();
  const [channel, setChannel] = useState(canSeeDashboard ? "dashboard" : null);
  useEffect(() => {
    if (!canSeeDashboard && channel === null && myChannels[0]) setChannel(myChannels[0].id);
  }, [canSeeDashboard, channel, myChannels]);

  return (
    <>
      <PageHead
        title="Efforts vs Outcome"
        sub="Monthly effort & outcome targets vs actuals, per channel. Carried-forward shortfalls roll into the next month."
        actions={
          <select value={channel || ""} onChange={(e) => setChannel(e.target.value)}>
            {canSeeDashboard && <option value="dashboard">Dashboard (all channels)</option>}
            {myChannels.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        }
      />
      {channel === "dashboard" ? (
        <DashboardView db={db} channels={allChannels} />
      ) : channel ? (
        <ChannelView
          key={channel}
          projectId={channel}
          canEdit={!isViewer() && isProjectManager(channel)}
          db={db}
          eoAddMonth={eoAddMonth}
          eoDeleteMonth={eoDeleteMonth}
          eoSaveEntry={eoSaveEntry}
          openRows={() => modals.openEoRows(channel)}
        />
      ) : (
        <div className="empty">No channel to show. Ask an admin to make you a channel lead.</div>
      )}
    </>
  );
}

// ---------------- Dashboard: one row per channel ----------------
function DashboardView({ db, channels }) {
  const trackerProjects = channels.filter((p) => db.eoMetrics.some((m) => m.project_id === p.id));
  const allMonths = useMemo(() => {
    const s = new Set([currentMonthKey()]);
    db.eoMonths.forEach((m) => s.add(m.month));
    db.eoEntries.forEach((e) => s.add(e.month));
    return [...s].sort();
  }, [db.eoMonths, db.eoEntries]);
  const [from, setFrom] = useState(allMonths[0]);
  const [to, setTo] = useState(allMonths[allMonths.length - 1]);
  const shown = allMonths.filter((m) => m >= from && m <= to);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth;
  }, [shown.length]);

  const perChannel = trackerProjects.map((p) => {
    const metrics = sortMetrics(db.eoMetrics.filter((m) => m.project_id === p.id));
    const entries = db.eoEntries.filter((e) => e.project_id === p.id);
    const chMonths = [
      ...new Set([
        ...db.eoMonths.filter((mm) => mm.project_id === p.id).map((mm) => mm.month),
        ...entries.map((e) => e.month),
      ]),
    ].sort();
    const cells = computeChannel(metrics, chMonths.length ? chMonths : [currentMonthKey()], entries);
    return { p, metrics, cells };
  });

  return (
    <>
      <MonthFilter allMonths={allMonths} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {trackerProjects.length === 0 ? (
        <div className="empty" style={{ marginTop: 14 }}>No channels have a tracker yet.</div>
      ) : (
        <div className="eo-wrap" ref={wrapRef} style={{ marginTop: 12 }}>
          <table className="eo-table">
            <thead>
              <tr>
                <th className="eo-sticky" style={{ left: 0, minWidth: 190, maxWidth: 190, zIndex: 5 }}>Channel</th>
                {shown.map((mk) => (
                  <th key={mk} className="eo-monthhead eo-mstart" colSpan={4}>{monthLabel(mk)}</th>
                ))}
              </tr>
              <tr>
                <th className="eo-sticky" style={{ left: 0, minWidth: 190, maxWidth: 190, zIndex: 5 }}></th>
                {shown.map((mk) => (
                  <React.Fragment key={mk}>
                    <th className="eo-mstart">Effort %</th>
                    <th>Outcome %</th>
                    <th>Carried Fwd</th>
                    <th># Lagging</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {perChannel.map(({ p, metrics, cells }) => (
                <tr key={p.id}>
                  <td className="eo-sticky eo-metricname" style={{ left: 0, minWidth: 190, maxWidth: 190 }}>{p.name}</td>
                  {shown.map((mk) => {
                    const s = channelMonthSummary(metrics, cells, mk);
                    return (
                      <React.Fragment key={mk}>
                        <td className={"eo-mstart " + attainColor(s.effortPct)}>{fmtPct(s.effortPct)}</td>
                        <td className={attainColor(s.outcomePct)}>{fmtPct(s.outcomePct)}</td>
                        <td className="eo-auto eo-num">{s.carriedFwd ? fmtNum(s.carriedFwd) : ""}</td>
                        <td className="eo-auto eo-num" style={s.lagging ? { color: "var(--red)", fontWeight: 700 } : undefined}>
                          {s.lagging || ""}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="sub" style={{ marginTop: 10 }}>
        Effort % / Outcome % = average attainment across the channel's effort / outcome metrics that month.
        Carried Fwd = total effort shortfall rolling into next month. # Lagging = metrics that finished below 100%.
        Green ≥ 100%, yellow 80–99%, red &lt; 80%.
      </div>
    </>
  );
}

// ---------------- Column preferences (freeze / hide), persisted per channel ---
function useColPrefs(projectId) {
  const key = "eo-cols-" + projectId;
  const [prefs, setPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { pins: CONFIG_COLS.map((c) => c.key), hiddenCfg: [], hiddenSub: [] };
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch (e) {}
  }, [key, prefs]);
  return [prefs, setPrefs];
}

// ---------------- Channel tracker (spreadsheet) ----------------
function ChannelView({ projectId, canEdit, db, eoAddMonth, eoDeleteMonth, eoSaveEntry, openRows }) {
  const { eoAddMetric, eoDeleteMetric } = useApp();
  const dlg = useDialog();

  const metrics = useMemo(
    () => sortMetrics(db.eoMetrics.filter((m) => m.project_id === projectId)),
    [db.eoMetrics, projectId]
  );
  const entries = useMemo(() => db.eoEntries.filter((e) => e.project_id === projectId), [db.eoEntries, projectId]);
  const allMonths = useMemo(() => {
    const s = new Set([currentMonthKey()]);
    db.eoMonths.filter((m) => m.project_id === projectId).forEach((m) => s.add(m.month));
    entries.forEach((e) => s.add(e.month));
    return [...s].sort();
  }, [db.eoMonths, entries, projectId]);

  // Default window spans the FULL range of months that have data.
  const [from, setFrom] = useState(allMonths[0]);
  const [to, setTo] = useState(allMonths[allMonths.length - 1]);
  useEffect(() => {
    setFrom(allMonths[0]);
    setTo(allMonths[allMonths.length - 1]);
  }, [projectId, allMonths.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = allMonths.filter((m) => m >= from && m <= to);

  const cells = useMemo(() => computeChannel(metrics, allMonths, entries), [metrics, allMonths, entries]);
  const [prefs, setPrefs] = useColPrefs(projectId);
  const [showCols, setShowCols] = useState(false);

  const wrapRef = useRef(null);
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth;
  }, [shown.length]);

  // resolve visible / pinned config columns (Metric is always shown & pinned)
  const pins = new Set([...(prefs.pins || []), "name"]);
  const hiddenCfg = new Set((prefs.hiddenCfg || []).filter((k) => k !== "name"));
  const hiddenSub = new Set(prefs.hiddenSub || []);
  const shownCfg = CONFIG_COLS.filter((c) => !hiddenCfg.has(c.key));
  const orderedCfg = [];
  let left = 0;
  shownCfg.filter((c) => pins.has(c.key)).forEach((c) => {
    orderedCfg.push({ ...c, pinned: true, left });
    left += c.w;
  });
  shownCfg.filter((c) => !pins.has(c.key)).forEach((c) => orderedCfg.push({ ...c, pinned: false }));
  const shownSub = SUB_COLS.filter((s) => !hiddenSub.has(s.key));
  const totalCols = orderedCfg.length + shown.length * shownSub.length;

  const cfgStyle = (c, header) =>
    c.pinned
      ? { left: c.left, minWidth: c.w, maxWidth: c.w, zIndex: header ? 5 : 2 }
      : { minWidth: c.w, maxWidth: c.w, position: "static" }; // unpinned: scrolls with the table

  const configValue = (m, key) =>
    key === "name" ? m.name : key === "unit" ? m.unit : key === "direction" ? (m.direction === "higher" ? "Higher" : "Lower") : m.carry ? "Yes" : "No";

  const subCell = (m, mk, sub) => {
    const c = cells[m.id]?.[mk] || {};
    const first = allMonths[0] === mk;
    if (sub.key === "base")
      return <EoCell value={c.base} canEdit={canEdit} onCommit={(v) => eoSaveEntry(projectId, m.id, mk, { base_target: v })} />;
    if (sub.key === "carried")
      return first ? (
        <EoCell value={c.entry?.carried_in ?? 0} canEdit={canEdit} onCommit={(v) => eoSaveEntry(projectId, m.id, mk, { carried_in: v })} />
      ) : (
        <span className="eo-auto eo-num">{fmtNum(c.carriedIn)}</span>
      );
    if (sub.key === "total") return <span className="eo-auto eo-num">{fmtNum(c.total)}</span>;
    if (sub.key === "achieved")
      return <EoCell value={c.achieved} canEdit={canEdit} onCommit={(v) => eoSaveEntry(projectId, m.id, mk, { achieved: v })} />;
    if (sub.key === "attain") return fmtPct(c.attain);
    return <span className="eo-auto eo-num">{c.toCarry ? fmtNum(c.toCarry) : "0"}</span>;
  };

  async function addRow(section) {
    const name = await dlg.prompt(`New ${section} metric name:`);
    if (!name) return;
    const rows = metrics.filter((m) => m.section === section);
    const pos = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
    await eoAddMetric(projectId, { section, name, unit: "#", direction: "higher", carry: true, position: pos });
  }
  async function removeRow(m) {
    if (await dlg.confirm(`Remove the metric "${m.name}" and all its monthly values?`)) await eoDeleteMetric(m.id);
  }
  async function removeMonth(mk) {
    if (await dlg.confirm(`Remove ${monthLabel(mk)} for this channel? Its values are deleted (this is safe — the calculations for other months are unaffected).`))
      eoDeleteMonth(projectId, mk);
  }
  const addPrev = () => {
    const prev = monthAdd(allMonths[0], -1);
    eoAddMonth(projectId, prev).then(() => setFrom(prev));
  };
  const addNext = () => {
    const next = monthAdd(allMonths[allMonths.length - 1], 1);
    eoAddMonth(projectId, next).then(() => setTo(next));
  };

  const renderRows = (section) =>
    metrics
      .filter((m) => m.section === section)
      .map((m) => (
        <tr key={m.id}>
          {orderedCfg.map((c) => (
            <td key={c.key} className={"eo-sticky" + (c.key === "name" ? " eo-metricname" : "") + (c.pinned ? "" : "")} style={cfgStyle(c)}>
              {c.key === "name" ? (
                <span>
                  {m.name}
                  {canEdit && <span className="eo-xbtn" title="Remove metric" onClick={() => removeRow(m)}>×</span>}
                </span>
              ) : (
                configValue(m, c.key)
              )}
            </td>
          ))}
          {shown.map((mk) =>
            shownSub.map((sub, i) => (
              <td key={mk + sub.key} className={(i === 0 ? "eo-mstart " : "") + (sub.key === "attain" ? attainColor(cells[m.id]?.[mk]?.attain) : "")}>
                {subCell(m, mk, sub)}
              </td>
            ))
          )}
        </tr>
      ));

  return (
    <>
      <div className="filters" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <MonthFilter allMonths={allMonths} from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="eo-cols">
            <button className="btn sm ghost" onClick={() => setShowCols((v) => !v)}>⚙ Columns</button>
            {showCols && (
              <ColumnsMenu prefs={prefs} setPrefs={setPrefs} close={() => setShowCols(false)} />
            )}
          </div>
          {canEdit && (
            <>
              <button className="btn sm ghost" onClick={addPrev}>+ Previous month</button>
              <button className="btn sm ghost" onClick={addNext}>+ Next month</button>
              <button className="btn sm" onClick={openRows}>✏️ Manage rows</button>
            </>
          )}
        </div>
      </div>

      {metrics.length === 0 ? (
        <div className="empty" style={{ marginTop: 14 }}>
          No metrics yet.{canEdit ? " Use “Manage rows”, or the + Add buttons below, to add effort and outcome metrics." : ""}
        </div>
      ) : (
        <div className="eo-wrap" ref={wrapRef} style={{ marginTop: 12 }}>
          <table className="eo-table">
            <thead>
              <tr>
                {orderedCfg.map((c) => (
                  <th key={c.key} className="eo-sticky" style={cfgStyle(c, true)}></th>
                ))}
                {shown.map((mk) => (
                  <th key={mk} className="eo-monthhead eo-mstart" colSpan={shownSub.length}>
                    {monthLabel(mk)}
                    {canEdit && <span className="eo-xbtn" title="Remove this month" onClick={() => removeMonth(mk)}>×</span>}
                  </th>
                ))}
              </tr>
              <tr>
                {orderedCfg.map((c) => (
                  <th key={c.key} className="eo-sticky" style={cfgStyle(c, true)}>{c.label}</th>
                ))}
                {shown.map((mk) =>
                  shownSub.map((sub, i) => (
                    <th key={mk + sub.key} className={i === 0 ? "eo-mstart" : ""}>{sub.label}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              <tr className="eo-section">
                <td className="eo-sticky" style={{ left: 0 }} colSpan={totalCols}>
                  EFFORT — activities &amp; output the team produces
                </td>
              </tr>
              {renderRows("effort")}
              {canEdit && (
                <tr className="eo-addrow">
                  <td className="eo-sticky" style={{ left: 0 }} colSpan={totalCols}>
                    <button className="linkbtn" onClick={() => addRow("effort")}>＋ Add effort metric</button>
                  </td>
                </tr>
              )}
              <tr className="eo-section">
                <td className="eo-sticky" style={{ left: 0 }} colSpan={totalCols}>
                  OUTCOME — results &amp; impact those activities drive
                </td>
              </tr>
              {renderRows("outcome")}
              {canEdit && (
                <tr className="eo-addrow">
                  <td className="eo-sticky" style={{ left: 0 }} colSpan={totalCols}>
                    <button className="linkbtn" onClick={() => addRow("outcome")}>＋ Add outcome metric</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="sub" style={{ marginTop: 10 }}>
        Editable cells: Base Target, Achieved, and the first month's Carried In. Everything else is calculated.
        Attain % is green ≥ 100%, yellow 80–99%, red &lt; 80%. Use ⚙ Columns to freeze or hide columns.
      </div>
    </>
  );
}

function ColumnsMenu({ prefs, setPrefs, close }) {
  const pins = new Set([...(prefs.pins || []), "name"]);
  const hiddenCfg = new Set(prefs.hiddenCfg || []);
  const hiddenSub = new Set(prefs.hiddenSub || []);
  const toggle = (setName, key) => {
    const cur = new Set(prefs[setName] || []);
    cur.has(key) ? cur.delete(key) : cur.add(key);
    setPrefs({ ...prefs, [setName]: [...cur] });
  };
  return (
    <div className="eo-colsmenu" onMouseLeave={close}>
      <h4>Freeze columns (stay visible when scrolling)</h4>
      {CONFIG_COLS.map((c) => (
        <label key={c.key}>
          <input
            type="checkbox"
            checked={pins.has(c.key)}
            disabled={c.key === "name"}
            onChange={() => toggle("pins", c.key)}
          />
          {c.label}
          {c.key === "name" ? " (always)" : ""}
        </label>
      ))}
      <h4>Show config columns</h4>
      {CONFIG_COLS.filter((c) => c.key !== "name").map((c) => (
        <label key={c.key}>
          <input type="checkbox" checked={!hiddenCfg.has(c.key)} onChange={() => toggle("hiddenCfg", c.key)} />
          {c.label}
        </label>
      ))}
      <h4>Show month columns</h4>
      <div className="hint">These are calculation columns — you can hide them, but they're never deleted so the carry-forward math stays intact.</div>
      {SUB_COLS.map((s) => (
        <label key={s.key}>
          <input type="checkbox" checked={!hiddenSub.has(s.key)} onChange={() => toggle("hiddenSub", s.key)} />
          {s.label}
        </label>
      ))}
    </div>
  );
}
