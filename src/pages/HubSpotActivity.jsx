import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import { fmtUpdated } from "../lib/instantly.js";
import {
  BACKFILL_FROM,
  HUBSPOT_DEAL_URL,
  PRESETS,
  TYPES,
  chartBuckets,
  fmt,
  joinList,
  loadHubspotData,
  monthLabel,
  neglectedDeals,
  nice,
  niceY,
  pendingByOwner,
  personList,
  rangeFor,
  rowsIn,
  runHubspotSync,
  stageShort,
  todayIST,
} from "../lib/hubspot.js";

const RECENT_MS = 10 * 60 * 1000;
const SWATCH = { calls: "var(--hs-calls)", emails: "var(--hs-emails)", meetings: "var(--hs-meetings)", tasks: "var(--hs-tasks)" };

function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v ?? "all"} type="button" className={v === value ? "on" : ""} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const Sw = ({ t }) => <i className="hs-sw" style={{ background: SWATCH[t] }} />;

function Tile({ label, swatch, value, sub, subBad }) {
  return (
    <div className="stat">
      <div className="n">{value}</div>
      <div className="l">
        {swatch && <Sw t={swatch} />}
        {label}
      </div>
      {sub != null && <div className={"ix-sub" + (subBad ? " hs-bad" : "")}>{sub}</div>}
    </div>
  );
}

// Number cell: muted when zero, red when `bad` and non-zero.
const Num = ({ v, bad, strong }) => (
  <td className={"num" + (v ? (bad ? " hs-bad" : "") : " hs-zero")} style={strong ? { fontWeight: 700 } : undefined}>
    {fmt(v)}
  </td>
);

function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? "ix-spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </svg>
  );
}

// ---- Follow-ups chart: stacked calls / emails / meetings ----
function FollowupChart({ keys, by, monthly }) {
  const box = useRef(null);
  const [W0, setW] = useState(600);
  const [tip, setTip] = useState(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(280, W0), H = 220, L = 40, B = 24, T = 8;
  const max = Math.max(4, ...keys.map((k) => TYPES.reduce((s, x) => s + by[k][x], 0)));
  const mag = Math.pow(10, Math.floor(Math.log10(max))), rr = max / mag;
  const step = rr > 5 ? 2 * mag : rr > 2 ? mag : mag / 2;
  const top = Math.ceil(max / step) * step;
  const y = (v) => T + (H - B - T) * (1 - v / top);
  const bw = (W - L) / Math.max(keys.length, 1);
  const every = Math.max(1, Math.ceil(keys.length / Math.max(1, Math.floor((W - L) / 54))));
  const label = (k) => (monthly ? monthLabel(k) : nice(k));
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);

  function move(e, k) {
    const rect = box.current.getBoundingClientRect();
    setTip({ k, x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width });
  }

  return (
    <div className="hs-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={monthly ? "Follow-ups per month" : "Follow-ups per day"}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {fmt(v)}
            </text>
          </g>
        ))}
        {keys.map((k, i) => {
          let acc = 0;
          const x = L + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
          return (
            <g key={k}>
              {TYPES.map((tp) => {
                const v = by[k][tp];
                if (!v) return null;
                const r = <rect key={tp} x={x} width={w} y={y(acc + v)} height={y(acc) - y(acc + v)} fill={SWATCH[tp]} />;
                acc += v;
                return r;
              })}
              <rect x={L + i * bw} width={bw} y={T} height={H - B - T} fill="transparent" onMouseMove={(e) => move(e, k)} onMouseLeave={() => setTip(null)} />
              {i % every === 0 && (
                <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {label(k)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hs-tip" style={{ left: Math.max(4, Math.min(tip.x + 12, tip.w - 250)), top: Math.max(4, tip.y - 46) }}>
          <b>{label(tip.k)}</b>
          <div>
            {fmt(by[tip.k].calls)} calls · {fmt(by[tip.k].emails)} emails · {fmt(by[tip.k].meetings)} meetings
          </div>
        </div>
      )}
    </div>
  );
}

export default function HubSpotActivity() {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState({ from: null, to: null });
  const [person, setPerson] = useState(null);
  const [stage, setStage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncErr, setSyncErr] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await loadHubspotData());
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message || String(e));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (!syncMsg) return;
    const t = setTimeout(() => setSyncMsg(""), 10000);
    return () => clearTimeout(t);
  }, [syncMsg]);

  async function refresh() {
    if (syncing) return;
    setSyncErr("");
    if (data?.lastUpdated && Date.now() - new Date(data.lastUpdated).getTime() < RECENT_MS) {
      setSyncMsg("Updated a few minutes ago");
      return;
    }
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await runHubspotSync();
      if (res?.status === "skipped") setSyncMsg("Updated a few minutes ago");
      if (res?.status === "partial") setSyncMsg("Loading history in steps: press refresh again to continue");
      await reload();
    } catch (e) {
      setSyncErr("Refresh failed: " + (e.message || e));
    } finally {
      setSyncing(false);
    }
  }

  const today = todayIST();
  const daily = data?.daily || [];
  const firstDay = useMemo(() => daily.reduce((m, r) => (r.d < m ? r.d : m), today), [daily, today]);
  const [from, to] = rangeFor(preset, custom, firstDay, today);
  const ready = !!data;
  const people = useMemo(() => personList(data?.people || []), [data]);
  const nameOf = useMemo(() => Object.fromEntries(people), [people]);
  const stages = data?.stages || [];
  const stageLabel = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.label])), [stages]);
  const threshold = data?.threshold ?? 10;

  const v = useMemo(() => {
    const rs = rowsIn(daily, from, to, person);
    const tot = { calls: 0, emails: 0, meetings: 0, tasks: 0 };
    rs.forEach((r) => (tot[r.t] += r.n));
    const pending = pendingByOwner(data?.open || [], Date.now(), today);
    const neglected = neglectedDeals(data?.deals || [], threshold, today);
    const mineDeals = neglected.filter((d) => !person || d.o === person);
    const pendSum = Object.entries(pending)
      .filter(([o]) => !person || o === person)
      .reduce((a, [, p]) => ({ pending: a.pending + p.pending, overdue: a.overdue + p.overdue }), { pending: 0, overdue: 0 });

    const per = {};
    people.forEach(([o]) => {
      if (!person || o === person) per[o] = { calls: 0, emails: 0, meetings: 0, tasks: 0 };
    });
    rs.forEach((r) => {
      if (per[r.o]) per[r.o][r.t] += r.n;
    });
    const stale = {};
    neglected.forEach((d) => (stale[d.o] = (stale[d.o] || 0) + 1));
    const summary = Object.entries(per)
      .map(([o, x]) => ({ o, ...x, fu: x.calls + x.emails + x.meetings, p: pending[o] || { pending: 0, overdue: 0 }, st: stale[o] || 0 }))
      .filter((x) => x.fu > 0 || x.tasks > 0 || x.p.pending > 0 || x.st > 0 || person)
      .sort((a, b) => b.fu - a.fu || (nameOf[a.o] || "").localeCompare(nameOf[b.o] || ""));

    const pendRows = Object.keys(pending)
      .filter((o) => nameOf[o] && (!person || o === person))
      .sort((a, b) => pending[b].pending - pending[a].pending)
      .map((o) => ({ o, ...pending[o] }));

    return { rs, tot, pendSum, mineDeals, summary, pendRows, chart: chartBuckets(rs, from, to, firstDay) };
  }, [daily, from, to, person, data, people, nameOf, threshold, today, firstDay]);

  const dealList = v.mineDeals.filter((d) => !stage || d.stage === stage);
  const shownDeals = showAll ? dealList : dealList.slice(0, 10);
  const followups = v.tot.calls + v.tot.emails + v.tot.meetings;
  const dash = (s) => (ready ? s : "—");

  function pickPreset(p) {
    setPreset(p);
  }
  function pickDate(which, value, valid) {
    if (!value || !valid) return;
    const f = which === "from" ? value : from;
    const t = which === "to" ? value : to;
    setCustom({ from: f, to: t < f ? f : t });
    setPreset("custom");
  }
  function pickStage(s) {
    setStage(s);
    setShowAll(false);
  }

  const header = (
    <div className="ix-updated">
      <div>
        <div>Last updated: {data ? fmtUpdated(data.lastUpdated) : "—"}</div>
        {syncMsg && <div className="ix-sub">{syncMsg}</div>}
        {syncErr && <div className="ix-sub ix-red">{syncErr}</div>}
      </div>
      <button
        type="button"
        className="btn sm ghost ix-refresh"
        onClick={refresh}
        disabled={syncing}
        title={syncing ? "Refreshing…" : "Refresh now"}
        aria-label={syncing ? "Refreshing" : "Refresh now"}
      >
        <RefreshIcon spinning={syncing} />
      </button>
    </div>
  );

  return (
    <div className="hs">
      <PageHead
        title="HubSpot Team Activity"
        sub="Follow-ups, tasks and neglected deals across the sales team, from HubSpot"
        actions={header}
      />

      {loadErr && <div className="note">Couldn't load HubSpot data: {loadErr}</div>}
      {ready && !data.lastUpdated && !daily.length && (
        <div className="note">No HubSpot data yet. Press the refresh button at the top right to run the first sync.</div>
      )}

      <div className="panel hs-filters">
        <div className="hs-row" role="group" aria-label="Date range">
          <span className="ix-lbl hs-flabel">Date range</span>
          <Seg label="Date range" options={PRESETS} value={preset} onChange={pickPreset} />
          <label className="ix-date">
            <span className="ix-lbl">From</span>
            <input type="date" min={BACKFILL_FROM} max="2099-12-31" aria-label="From" value={from}
              onChange={(e) => pickDate("from", e.target.value, e.target.validity.valid)} />
          </label>
          <label className="ix-date">
            <span className="ix-lbl">To</span>
            <input type="date" min={BACKFILL_FROM} max="2099-12-31" aria-label="To" value={to}
              onChange={(e) => pickDate("to", e.target.value, e.target.validity.valid)} />
          </label>
          <span className="hs-range-note">{from === to ? niceY(from) : `${niceY(from)} – ${niceY(to)}`}</span>
        </div>
        <div className="hs-row" role="group" aria-label="Person">
          <span className="ix-lbl hs-flabel">Person</span>
          <Seg label="Person" options={[[null, "All people"], ...people]} value={person} onChange={setPerson} />
        </div>
      </div>

      <div className="panel hs-card hs-alert">
        <div className="hs-head">
          <h2>Important deals not contacted in {threshold}+ days</h2>
          <span>As of now · {joinList(stages.map((s) => stageShort(s.label)))} stages</span>
        </div>
        <div className="hs-stages" role="group" aria-label="Stage">
          <button type="button" className="hs-stage" aria-pressed={stage === ""} onClick={() => pickStage("")}>
            All <b>{dash(fmt(v.mineDeals.length))}</b>
          </button>
          {stages.map((s) => (
            <button key={s.id} type="button" className="hs-stage" aria-pressed={stage === s.id} onClick={() => pickStage(s.id)}>
              {s.label} <b>{dash(fmt(v.mineDeals.filter((d) => d.stage === s.id).length))}</b>
            </button>
          ))}
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr>
                <th>Deal</th><th>Stage</th><th>Owner</th><th>Last contacted</th><th className="num">Days without contact</th><th></th>
              </tr>
            </thead>
            <tbody>
              {ready && !dealList.length && (
                <tr>
                  <td colSpan={6} className="hs-empty">
                    Nothing neglected here. Every deal in these stages was contacted in the last {threshold} days.
                  </td>
                </tr>
              )}
              {shownDeals.map((d) => (
                <tr key={d.id}>
                  <td className="hs-deal">{d.name}</td>
                  <td><span className="hs-stage-tag">{stageLabel[d.stage] || d.stage}</span></td>
                  <td>{nameOf[d.o] || "Unassigned"}</td>
                  <td className={d.last ? "" : "hs-bad"}>{d.last ? niceY(d.last) : "Never contacted"}</td>
                  <td className="num hs-days">{d.last ? fmt(d.days) : "—"}</td>
                  <td className="num hs-linkcell">
                    <a className="hs-open" href={HUBSPOT_DEAL_URL + d.id} target="_blank" rel="noopener noreferrer">Open in HubSpot</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dealList.length > 10 && (
          <div className="hs-more">
            <button type="button" className="hs-linkbtn" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${dealList.length}`}
            </button>
          </div>
        )}
      </div>

      <div className="hs-sec-title">Follow-ups and tasks</div>
      <div className="cards hs-tiles">
        <Tile label="Follow-ups" value={dash(fmt(followups))} sub="calls + emails + meetings" />
        <Tile label="Calls" swatch="calls" value={dash(fmt(v.tot.calls))} />
        <Tile label="Emails" swatch="emails" value={dash(fmt(v.tot.emails))} />
        <Tile label="Meetings" swatch="meetings" value={dash(fmt(v.tot.meetings))} />
        <Tile label="Tasks completed" swatch="tasks" value={dash(fmt(v.tot.tasks))} />
        <Tile label="Pending tasks" value={dash(fmt(v.pendSum.pending))} sub={dash(`${fmt(v.pendSum.overdue)} overdue`)} subBad />
      </div>

      <div className="panel hs-card">
        <div className="hs-head">
          <h2>Team Activity Summary</h2>
          <span>{person ? nameOf[person] : `${v.summary.length} people`}</span>
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr>
                <th>Person</th><th className="num">Calls</th><th className="num">Emails</th><th className="num">Meetings</th>
                <th className="num">Follow-ups</th><th className="num">Tasks done</th><th className="num">Pending tasks</th>
                <th className="num">Overdue tasks</th><th className="num">Neglected deals</th>
              </tr>
            </thead>
            <tbody>
              {ready && !v.summary.length && (
                <tr><td colSpan={9} className="hs-empty">No activity logged in these dates.</td></tr>
              )}
              {v.summary.map((x) => (
                <tr key={x.o}>
                  <td className="hs-who">{nameOf[x.o]}</td>
                  <Num v={x.calls} /><Num v={x.emails} /><Num v={x.meetings} />
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(x.fu)}</td>
                  <Num v={x.tasks} /><Num v={x.p.pending} /><Num v={x.p.overdue} bad /><Num v={x.st} bad />
                </tr>
              ))}
            </tbody>
            {v.summary.length > 1 && (
              <tfoot>
                <tr>
                  <td>Team total</td>
                  <td className="num">{fmt(v.tot.calls)}</td>
                  <td className="num">{fmt(v.tot.emails)}</td>
                  <td className="num">{fmt(v.tot.meetings)}</td>
                  <td className="num">{fmt(followups)}</td>
                  <td className="num">{fmt(v.tot.tasks)}</td>
                  <td className="num">{fmt(v.pendSum.pending)}</td>
                  <td className={"num" + (v.pendSum.overdue ? " hs-bad" : "")}>{fmt(v.pendSum.overdue)}</td>
                  <td className="num hs-bad">{fmt(v.summary.reduce((s, x) => s + x.st, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="hs-note">Pending tasks, overdue tasks and neglected deals are as of now and don’t change with the date range.</p>
      </div>

      <div className="panel hs-card">
        <div className="hs-head">
          <h2>{v.chart.monthly ? "Follow-ups per month" : "Follow-ups per day"}</h2>
          <span>Hover a bar for the breakdown</span>
        </div>
        {ready ? <FollowupChart keys={v.chart.keys} by={v.chart.by} monthly={v.chart.monthly} /> : <div className="hs-empty">—</div>}
        <div className="hs-legend">
          <span><Sw t="calls" />Calls</span>
          <span><Sw t="emails" />Emails</span>
          <span><Sw t="meetings" />Meetings</span>
        </div>
      </div>

      <div className="panel hs-card">
        <div className="hs-head">
          <h2>Pending tasks</h2>
          <span>As of now · overdue = due time has passed</span>
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr>
                <th>Person</th><th className="num">Due today</th><th className="num">Overdue</th><th className="num">Upcoming</th><th className="num">Total pending</th>
              </tr>
            </thead>
            <tbody>
              {ready && !v.pendRows.length && (
                <tr><td colSpan={5} className="hs-empty">No pending tasks.</td></tr>
              )}
              {v.pendRows.map((p) => (
                <tr key={p.o}>
                  <td className="hs-who">{nameOf[p.o]}</td>
                  <Num v={p.today} /><Num v={p.overdue} bad /><Num v={p.upcoming} /><Num v={p.pending} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
