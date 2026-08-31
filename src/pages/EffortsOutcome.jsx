import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppData.jsx";
import { useModals } from "../components/ModalHost.jsx";
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
} from "../lib/eo.js";

// The 4 frozen left columns, with cumulative left offsets for position:sticky.
const STICKY = [
  { key: "name", label: "Metric", w: 200, left: 0 },
  { key: "unit", label: "Unit", w: 54, left: 200 },
  { key: "direction", label: "Direction", w: 76, left: 254 },
  { key: "carry", label: "Carry?", w: 58, left: 330 },
];
const CONFIG_W = 388;
const SUB = ["Base Target", "Carried In", "Total Target", "Achieved", "Attain %", "To Carry"];

function stickyStyle(col, isHeader) {
  return { left: col.left, minWidth: col.w, maxWidth: col.w, zIndex: isHeader ? 4 : 2 };
}

export default function EffortsOutcome() {
  const {
    db,
    isAdmin,
    isViewer,
    isProjectManager,
    scopedProjects,
    activeProjects,
    uname,
    eoAddMonth,
    eoSaveEntry,
  } = useApp();
  const modals = useModals();

  // Channels this user may open (a channel is a project).
  const channels = useMemo(() => {
    // admin/viewer see every project; a manager sees only the ones they lead.
    return isAdmin() || isViewer() ? activeProjects() : scopedProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.projects, db.users]);

  const canSeeDashboard = isAdmin() || isViewer();
  const [channel, setChannel] = useState(canSeeDashboard ? "dashboard" : null);

  // default channel for managers
  useEffect(() => {
    if (!canSeeDashboard && channel === null && channels[0]) setChannel(channels[0].id);
  }, [canSeeDashboard, channel, channels]);

  return (
    <>
      <PageHead
        title="Efforts vs Outcome"
        sub="Monthly effort and outcome targets vs actuals, per channel. Carried-forward shortfalls roll into the next month."
        actions={
          <select value={channel || ""} onChange={(e) => setChannel(e.target.value)}>
            {canSeeDashboard && <option value="dashboard">Dashboard (all channels)</option>}
            {channels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />
      {channel === "dashboard" ? (
        <DashboardView db={db} />
      ) : channel ? (
        <ChannelView
          key={channel}
          projectId={channel}
          canEdit={!isViewer() && isProjectManager(channel)}
          uname={uname}
          db={db}
          eoAddMonth={eoAddMonth}
          eoSaveEntry={eoSaveEntry}
          openRows={() => modals.openEoRows(channel)}
        />
      ) : (
        <div className="empty">No channel to show. Ask an admin to make you a project lead.</div>
      )}
    </>
  );
}

// ---------------- Dashboard (admin / viewer): one row per channel ----------
function DashboardView({ db }) {
    const trackerProjects = db.projects.filter((p) => db.eoMetrics.some((m) => m.project_id === p.id));
    const allMonths = useMemo(() => {
      const s = new Set([currentMonthKey()]);
      db.eoMonths.forEach((m) => s.add(m.month));
      db.eoEntries.forEach((e) => s.add(e.month));
      return [...s].sort();
    }, [db.eoMonths, db.eoEntries]);
    const cur = currentMonthKey();
    const [from, setFrom] = useState(allMonths[0]);
    const [to, setTo] = useState(allMonths.filter((m) => m <= cur).slice(-1)[0] || allMonths[allMonths.length - 1]);
    const shown = allMonths.filter((m) => m >= from && m <= to);
    const wrapRef = useRef(null);
    useEffect(() => {
      if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth;
    }, [shown.length]);

    const perChannel = trackerProjects.map((p) => {
      const metrics = sortMetrics(db.eoMetrics.filter((m) => m.project_id === p.id));
      const entries = db.eoEntries.filter((e) => e.project_id === p.id);
      // chain over THIS channel's own months so Carried In is correct
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
          <div className="empty">No channels have a tracker yet.</div>
        ) : (
          <div className="eo-wrap" ref={wrapRef}>
            <table className="eo-table">
              <thead>
                <tr>
                  <th className="eo-sticky" style={stickyStyle({ left: 0, w: 180 }, true)}>Channel</th>
                  {shown.map((mk) => (
                    <th key={mk} className="eo-monthhead" colSpan={4}>
                      {monthLabel(mk)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="eo-sticky" style={stickyStyle({ left: 0, w: 180 }, true)}></th>
                  {shown.map((mk) => (
                    <React.Fragment key={mk}>
                      <th>Effort %</th>
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
                    <td className="eo-sticky eo-metricname" style={stickyStyle({ left: 0, w: 180 })}>
                      {p.name}
                    </td>
                    {shown.map((mk) => {
                      const s = channelMonthSummary(metrics, cells, mk);
                      return (
                        <React.Fragment key={mk}>
                          <td className={attainColor(s.effortPct)}>{fmtPct(s.effortPct)}</td>
                          <td className={attainColor(s.outcomePct)}>{fmtPct(s.outcomePct)}</td>
                          <td className="eo-auto">{s.carriedFwd ? fmtNum(s.carriedFwd) : ""}</td>
                          <td className={"eo-auto" + (s.lagging ? " " : "")} style={s.lagging ? { color: "var(--red)", fontWeight: 700 } : undefined}>
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

function sortMetrics(metrics) {
  const rank = { effort: 0, outcome: 1 };
  return [...metrics].sort(
    (a, b) =>
      (rank[a.section] - rank[b.section]) ||
      (a.position - b.position) ||
      (a.created_at || "").localeCompare(b.created_at || "")
  );
}

function MonthFilter({ allMonths, from, to, setFrom, setTo }) {
  return (
    <div className="filters">
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

// ---------------- Channel tracker table ----------------
function ChannelView({ projectId, canEdit, db, eoAddMonth, eoSaveEntry, openRows }) {
  const metrics = useMemo(
    () => sortMetrics(db.eoMetrics.filter((m) => m.project_id === projectId)),
    [db.eoMetrics, projectId]
  );
  const entries = useMemo(
    () => db.eoEntries.filter((e) => e.project_id === projectId),
    [db.eoEntries, projectId]
  );
  const allMonths = useMemo(() => {
    const s = new Set([currentMonthKey()]);
    db.eoMonths.filter((m) => m.project_id === projectId).forEach((m) => s.add(m.month));
    entries.forEach((e) => s.add(e.month));
    return [...s].sort();
  }, [db.eoMonths, entries, projectId]);

  // Default window: history up to the CURRENT month (future planned months are
  // hidden until the user widens the "To" filter).
  const defaultTo = () => {
    const cur = currentMonthKey();
    return allMonths.filter((m) => m <= cur).slice(-1)[0] || allMonths[allMonths.length - 1];
  };
  const [from, setFrom] = useState(allMonths[0]);
  const [to, setTo] = useState(defaultTo());
  useEffect(() => {
    setFrom(allMonths[0]);
    setTo(defaultTo());
  }, [projectId, allMonths.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = allMonths.filter((m) => m >= from && m <= to);
  const cells = useMemo(() => computeChannel(metrics, allMonths, entries), [metrics, allMonths, entries]);

  const wrapRef = useRef(null);
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth;
  }, [shown.length]);

  const effort = metrics.filter((m) => m.section === "effort");
  const outcome = metrics.filter((m) => m.section === "outcome");
  const totalCols = 4 + shown.length * 6;

  const addMonth = () => {
    const next = monthAdd(allMonths[allMonths.length - 1], 1);
    eoAddMonth(projectId, next).then(() => setTo(next));
  };

  const renderMetricRows = (rows) =>
    rows.map((m) => (
      <tr key={m.id}>
        <td className="eo-sticky eo-metricname" style={stickyStyle(STICKY[0])}>{m.name}</td>
        <td className="eo-sticky" style={stickyStyle(STICKY[1])}>{m.unit}</td>
        <td className="eo-sticky" style={stickyStyle(STICKY[2])}>{m.direction === "higher" ? "Higher" : "Lower"}</td>
        <td className="eo-sticky" style={stickyStyle(STICKY[3])}>{m.carry ? "Yes" : "No"}</td>
        {shown.map((mk) => {
          const c = cells[m.id]?.[mk] || {};
          const firstMonth = allMonths[0] === mk;
          return (
            <React.Fragment key={mk}>
              <td>
                <EoCell value={c.base} canEdit={canEdit} onCommit={(v) => eoSaveEntry(projectId, m.id, mk, { base_target: v })} />
              </td>
              <td>
                {firstMonth ? (
                  <EoCell value={c.entry?.carried_in ?? 0} canEdit={canEdit} onCommit={(v) => eoSaveEntry(projectId, m.id, mk, { carried_in: v })} />
                ) : (
                  <span className="eo-auto">{fmtNum(c.carriedIn)}</span>
                )}
              </td>
              <td className="eo-auto">{fmtNum(c.total)}</td>
              <td>
                <EoCell value={c.achieved} canEdit={canEdit} onCommit={(v) => eoSaveEntry(projectId, m.id, mk, { achieved: v })} />
              </td>
              <td className={attainColor(c.attain)}>{fmtPct(c.attain)}</td>
              <td className="eo-auto">{c.toCarry ? fmtNum(c.toCarry) : "0"}</td>
            </React.Fragment>
          );
        })}
      </tr>
    ));

  return (
    <>
      <div className="filters" style={{ justifyContent: "space-between" }}>
        <MonthFilter allMonths={allMonths} from={from} to={to} setFrom={setFrom} setTo={setTo} />
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm ghost" onClick={addMonth}>+ Add month</button>
            <button className="btn sm" onClick={openRows} title="Manage rows &amp; config">✏️ Edit rows</button>
          </div>
        )}
      </div>

      {metrics.length === 0 ? (
        <div className="empty">
          No metrics yet.{canEdit ? " Use “Edit rows” to add effort and outcome metrics." : ""}
        </div>
      ) : (
        <div className="eo-wrap" ref={wrapRef}>
          <table className="eo-table">
            <thead>
              <tr>
                {STICKY.map((c) => (
                  <th key={c.key} className="eo-sticky" style={stickyStyle(c, true)}></th>
                ))}
                {shown.map((mk) => (
                  <th key={mk} className="eo-monthhead" colSpan={6}>{monthLabel(mk)}</th>
                ))}
              </tr>
              <tr>
                {STICKY.map((c) => (
                  <th key={c.key} className="eo-sticky" style={stickyStyle(c, true)}>{c.label}</th>
                ))}
                {shown.map((mk) => (
                  <React.Fragment key={mk}>
                    {SUB.map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="eo-section">
                <td className="eo-sticky" style={{ left: 0 }} colSpan={totalCols}>
                  EFFORT — activities &amp; output the team is responsible for producing
                </td>
              </tr>
              {renderMetricRows(effort)}
              <tr className="eo-section">
                <td className="eo-sticky" style={{ left: 0 }} colSpan={totalCols}>
                  OUTCOME — results &amp; impact those activities are meant to drive
                </td>
              </tr>
              {renderMetricRows(outcome)}
            </tbody>
          </table>
        </div>
      )}
      <div className="sub" style={{ marginTop: 10 }}>
        Editable: Base Target, Achieved, and the first month's Carried In. Everything else is calculated.
        Attain % is green ≥ 100%, yellow 80–99%, red &lt; 80%.
      </div>
    </>
  );
}
