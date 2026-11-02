import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import TabAccessButton from "../components/TabAccess.jsx";
import { useApp } from "../context/AppData.jsx";
import { canSeeTab } from "../lib/tabAccess.js";
import { fmtUpdated } from "../lib/instantly.js";
import {
  CAT_COLOR,
  CAT_LABEL,
  CAT_ORDER,
  batchRows,
  campaignRows,
  chartDays,
  fmt,
  followUps,
  loadColdCallingData,
  nice,
  niceY,
  pct,
  rangeFor,
  regionSort,
  summaryRow,
  todayIST,
} from "../lib/coldCalling.js";

const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["all", "All time"],
];
const REFRESH_TIP = "To send the newest sheet data, use Cadence → Send to Cadence now in the Google Sheet.";

function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text, count]) => (
        <button key={v ?? "all"} type="button" className={v === value ? "on" : ""} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
          {count != null && <span className="seg-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

const Sw = ({ c }) => <i className="hs-sw" style={{ background: CAT_COLOR[c] }} />;

function Tile({ label, swatch, value, sub }) {
  return (
    <div className="stat">
      <div className="n">{value}</div>
      <div className="l">
        {swatch && <Sw c={swatch} />}
        {label}
      </div>
      <div className="ix-sub">{sub}</div>
    </div>
  );
}

// Number cell: muted when zero, red when `bad` and non-zero.
const Num = ({ v, bad, text }) => (
  <td className={"num" + (v ? (bad ? " hs-bad" : "") : " hs-zero")}>{text ?? fmt(v)}</td>
);

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </svg>
  );
}

// ---- Calls per day: stacked by outcome group ----
function CallsChart({ days, by }) {
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
  const W = Math.max(280, W0), H = 200, L = 30, B = 24, T = 8;
  const max = Math.max(4, ...days.map((d) => CAT_ORDER.reduce((s, c) => s + by[d][c], 0)));
  const mag = Math.pow(10, Math.floor(Math.log10(max))), rr = max / mag;
  const step = rr > 5 ? 2 * mag : rr > 2 ? mag : Math.max(1, mag / 2);
  const top = Math.ceil(max / step) * step;
  const y = (v) => T + (H - B - T) * (1 - v / top);
  const bw = (W - L) / Math.max(days.length, 1);
  const every = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor((W - L) / 54))));
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);

  function move(e, d) {
    const rect = box.current.getBoundingClientRect();
    setTip({ d, x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width });
  }
  const tipText = (d) => {
    const v = by[d];
    return `${nice(d)}: ${CAT_ORDER.reduce((s, c) => s + v[c], 0)} calls · ${v.pos} positive · ${v.fu} follow-up · ${v.neg} negative · ${v.nc} not connected · ${v.bad} bad`;
  };

  return (
    <div className="hs-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Calls per day">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          let acc = 0;
          const x = L + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
          return (
            <g key={d}>
              {CAT_ORDER.map((c) => {
                const v = by[d][c];
                if (!v) return null;
                const r = <rect key={c} x={x} width={w} y={y(acc + v)} height={y(acc) - y(acc + v)} fill={CAT_COLOR[c]} />;
                acc += v;
                return r;
              })}
              <rect x={L + i * bw} width={bw} y={T} height={H - B - T} fill="transparent" onMouseMove={(e) => move(e, d)} onMouseLeave={() => setTip(null)} />
              {i % every === 0 && (
                <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{nice(d)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="hs-tip" style={{ left: Math.max(4, Math.min(tip.x + 12, tip.w - 300)), top: Math.max(4, tip.y - 56) }}>
          {tipText(tip.d)}
        </div>
      )}
    </div>
  );
}

export default function ColdCalling() {
  const { me, db } = useApp();
  const allowed = canSeeTab("coldcalling", me, db);
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("all");
  const [custom, setCustom] = useState({ from: null, to: null });
  const [caller, setCaller] = useState(null);
  const [region, setRegion] = useState(null);
  const [product, setProduct] = useState("");
  const [industry, setIndustry] = useState("");
  const [fu, setFu] = useState("all");
  const [fuAll, setFuAll] = useState(false);

  const reload = useCallback(async () => {
    if (!allowed) return; // only load when this user can see the tab
    setLoading(true);
    try {
      setData(await loadColdCallingData());
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [allowed]);
  useEffect(() => {
    reload();
  }, [reload]);

  const today = todayIST();
  const all = data?.calls || [];
  const ready = !!data;
  const [from, to] = rangeFor(preset, custom, all, today);

  // Filter options come from the data.
  const callers = useMemo(() => [...new Set(all.map((r) => r.caller).filter(Boolean))].sort(), [all]);
  const regions = useMemo(() => [...new Set(all.map((r) => r.meta.region))].sort(regionSort), [all]);
  const products = useMemo(() => [...new Set(all.map((r) => r.meta.product))].sort(), [all]);
  const industries = useMemo(() => [...new Set(all.map((r) => r.meta.industry))].sort(), [all]);

  const v = useMemo(() => {
    const scoped = all.filter(
      (r) =>
        (!caller || r.caller === caller) &&
        (!region || r.meta.region === region) &&
        (!product || r.meta.product === product) &&
        (!industry || r.meta.industry === industry)
    );
    const cs = scoped.filter((r) => r.date && r.date >= from && r.date <= to);
    const team = summaryRow(cs);
    const names = [...new Set(cs.map((r) => r.caller))].sort();
    const perCaller = names
      .map((n) => [n, summaryRow(cs.filter((r) => r.caller === n))])
      .sort((a, b) => b[1].calls - a[1].calls);
    const oc = {};
    cs.forEach((r) => {
      oc[r.outcome] = oc[r.outcome] || { n: 0, cat: r.cat };
      oc[r.outcome].n++;
    });
    const outcomes = Object.entries(oc).sort(
      (a, b) => CAT_ORDER.indexOf(a[1].cat) - CAT_ORDER.indexOf(b[1].cat) || b[1].n - a[1].n
    );
    return {
      cs,
      team,
      perCaller,
      outcomes,
      reached: new Set(cs.filter((r) => r.conn).map((r) => r.key)).size,
      fus: followUps(scoped, today),
      camps: campaignRows(scoped),
      batches: batchRows(scoped),
      chart: chartDays(cs, from, to),
    };
  }, [all, caller, region, product, industry, from, to, today]);

  const fuCount = (s) => v.fus.filter((r) => s === "all" || r.status === s).length;
  const fuList = v.fus.filter((r) => fu === "all" || r.status === fu);
  const fuShown = fuAll ? fuList : fuList.slice(0, 10);
  const maxOutcome = Math.max(1, ...v.outcomes.map(([, o]) => o.n));
  const dash = (s) => (ready ? s : "—");

  function pickDate(which, value, valid) {
    if (!value || !valid) return;
    const f = which === "from" ? value : from;
    const t = which === "to" ? value : to;
    setCustom({ from: f, to: t < f ? f : t });
    setPreset("custom");
  }

  const header = (
    <div className="ix-updated">
      <div>Last received from sheet: {data ? fmtUpdated(data.lastReceived) : "—"}</div>
      <TabAccessButton tabKey="cold_calling" />
      <button type="button" className="btn sm ghost ix-refresh" onClick={reload} disabled={loading} title={REFRESH_TIP} aria-label="Reload from Cadence">
        <span className={loading ? "ix-spin" : ""} style={{ display: "inline-flex" }}><RefreshIcon /></span>
      </button>
    </div>
  );

  return (
    <div className="hs cc">
      <PageHead
        title="Cold Calling Activity"
        sub="Calls, outcomes and follow-ups from the sales team’s call log, plus the data team’s lead batches"
        actions={header}
      />

      {loadErr && <div className="note">Couldn't load the call log: {loadErr}</div>}
      {ready && !all.length && (
        <div className="note">No call data yet. Send it from the Google Sheet with Cadence → Send to Cadence now.</div>
      )}
      {ready && data.unknown.length > 0 && (
        <div className="cc-warn" role="status">
          These outcomes aren’t in the outcome list: <b>{data.unknown.join(", ")}</b>. Until an admin adds them in Admin Settings → Cold
          calling, they count as Not connected (or as Connected (other) if the name starts with “Connected”).
        </div>
      )}

      <div className="panel hs-filters">
        <div className="hs-row" role="group" aria-label="Date range">
          <span className="ix-lbl hs-flabel">Call date</span>
          <Seg label="Date range" options={PRESETS} value={preset} onChange={setPreset} />
          <label className="ix-date">
            <span className="ix-lbl">From</span>
            <input type="date" aria-label="From" value={from} onChange={(e) => pickDate("from", e.target.value, e.target.validity.valid)} />
          </label>
          <label className="ix-date">
            <span className="ix-lbl">To</span>
            <input type="date" aria-label="To" value={to} onChange={(e) => pickDate("to", e.target.value, e.target.validity.valid)} />
          </label>
          <span className="hs-range-note">{from === to ? niceY(from) : `${niceY(from)} – ${niceY(to)}`}</span>
        </div>
        <div className="hs-row" role="group" aria-label="Caller">
          <span className="ix-lbl hs-flabel">Caller</span>
          <Seg label="Caller" options={[[null, "All callers"], ...callers.map((n) => [n, n])]} value={caller} onChange={setCaller} />
        </div>
        <div className="hs-row" role="group" aria-label="Region">
          <span className="ix-lbl hs-flabel">Region</span>
          <Seg label="Region" options={[[null, "All regions"], ...regions.map((n) => [n, n])]} value={region} onChange={setRegion} />
        </div>
        <div className="hs-row">
          <span className="ix-lbl hs-flabel">Product</span>
          <select className="cc-select" aria-label="Product or service offering" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">All products</option>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="ix-lbl" style={{ marginLeft: 12 }}>Industry</span>
          <select className="cc-select" aria-label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">All industries</option>
            {industries.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="cards hs-tiles">
        <Tile label="Calls made" value={dash(fmt(v.team.calls))} sub={dash(fmt(v.team.leads) + (v.team.leads === 1 ? " lead" : " different leads"))} />
        <Tile label="Connected calls" value={dash(fmt(v.team.connected))}
          sub={dash(`${pct(v.team.connected, v.team.calls)} of calls · ${fmt(v.reached)}${v.reached === 1 ? " lead reached" : " leads reached"}`)} />
        <Tile label="Positive" swatch="pos" value={dash(fmt(v.team.pos))} sub={dash(fmt(v.team.meetings) + (v.team.meetings === 1 ? " meeting booked" : " meetings booked"))} />
        <Tile label="Follow-up" swatch="fu" value={dash(fmt(v.team.fu))} sub="asked to call back" />
        <Tile label="Negative" swatch="neg" value={dash(fmt(v.team.neg))} sub="not interested" />
        <Tile label="Not connected" swatch="nc" value={dash(fmt(v.team.nc))} sub="no answer, voicemail, gatekeeper" />
        <Tile label="Bad numbers" swatch="bad" value={dash(fmt(v.team.bad))} sub="wrong or invalid" />
      </div>

      <div className="panel hs-card">
        <div className="hs-head">
          <h2>Caller summary</h2>
          <span>{v.perCaller.length} {v.perCaller.length === 1 ? "caller" : "callers"}</span>
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr>
                <th>Caller</th><th className="num">Calls</th><th className="num">Leads called</th><th className="num">Connected calls</th>
                <th className="num">Connect rate</th><th className="num">Positive</th><th className="num">Meetings</th><th className="num">Follow-up</th>
                <th className="num">Negative</th><th className="num">Not connected</th><th className="num">Bad numbers</th>
              </tr>
            </thead>
            <tbody>
              {ready && !v.perCaller.length && (
                <tr><td colSpan={11} className="hs-empty">No calls logged in these dates.</td></tr>
              )}
              {v.perCaller.map(([n, s]) => (
                <tr key={n}>
                  <td className="hs-who">{n || "Not filled in"}</td>
                  <Num v={s.calls} /><Num v={s.leads} /><Num v={s.connected} /><Num v={s.calls} text={s.rate} />
                  <Num v={s.pos} /><Num v={s.meetings} /><Num v={s.fu} /><Num v={s.neg} /><Num v={s.nc} /><Num v={s.bad} />
                </tr>
              ))}
            </tbody>
            {v.perCaller.length > 1 && (
              <tfoot>
                <tr>
                  <td>Team total</td>
                  {["calls", "leads", "connected", "rate", "pos", "meetings", "fu", "neg", "nc", "bad"].map((k) => (
                    <td key={k} className="num">{k === "rate" ? v.team.rate : fmt(v.team[k])}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="cc-grid2">
        <div className="panel hs-card">
          <div className="hs-head">
            <h2>Calls by outcome</h2>
            <span>Each outcome and the group it counts in</span>
          </div>
          <div className="cc-bars">
            {v.outcomes.map(([o, x]) => (
              <div className="cc-brow" key={o}>
                <div>
                  <div className="hs-who">{o || "No outcome"}</div>
                  <div className="cc-blabel">{CAT_LABEL[x.cat]}</div>
                </div>
                <div className="cc-track"><div className="cc-fill" style={{ width: `${(100 * x.n) / maxOutcome}%`, background: CAT_COLOR[x.cat] }} /></div>
                <div className="num" style={{ fontWeight: 700 }}>{fmt(x.n)}</div>
              </div>
            ))}
            {ready && !v.cs.length && <div className="hs-empty">No calls in these dates.</div>}
          </div>
        </div>
        <div className="panel hs-card">
          <div className="hs-head">
            <h2>Calls per day</h2>
            <span>Hover a bar for the breakdown</span>
          </div>
          {ready ? <CallsChart days={v.chart.days} by={v.chart.by} /> : <div className="hs-empty">—</div>}
          <div className="hs-legend">
            {["pos", "fu", "neg", "nc", "bad"].map((c) => (
              <span key={c}><Sw c={c} />{CAT_LABEL[c]}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="panel hs-card">
        <div className="hs-head">
          <h2>Follow-ups due</h2>
          <span>As of now · latest call per lead with a next follow-up date</span>
        </div>
        <div className="hs-stages">
          <Seg
            label="Follow-up status"
            options={[["all", "All", fuCount("all")], ["overdue", "Overdue", fuCount("overdue")], ["today", "Due today", fuCount("today")], ["upcoming", "Upcoming", fuCount("upcoming")]]}
            value={fu}
            onChange={(s) => { setFu(s); setFuAll(false); }}
          />
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr><th>Follow-up date</th><th>Contact</th><th>Company</th><th>Campaign</th><th>Caller</th><th>Last outcome</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {ready && !fuList.length && <tr><td colSpan={7} className="hs-empty">No follow-ups here.</td></tr>}
              {fuShown.map((r, i) => (
                <tr key={r.key + i}>
                  <td className={r.status === "overdue" ? "hs-bad" : ""}>{niceY(r.fu)}</td>
                  <td className="hs-who">{r.contact}</td>
                  <td>{r.company}</td>
                  <td>{r.campaign || "—"}</td>
                  <td>{r.caller}</td>
                  <td>{r.outcome}</td>
                  <td className="cc-wrap">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fuList.length > 10 && (
          <div className="hs-more">
            <button type="button" className="hs-linkbtn" onClick={() => setFuAll(!fuAll)}>
              {fuAll ? "Show fewer" : `Show all ${fuList.length}`}
            </button>
          </div>
        )}
      </div>

      <div className="hs-sec-title">Data mining team</div>
      <div className="panel hs-card">
        <div className="hs-head">
          <h2>Campaigns</h2>
          <span>As of now · product, industry and region read from the campaign name</span>
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr>
                <th>Campaign</th><th>Product</th><th>Industry</th><th>Region</th><th className="num">Contacts given</th>
                <th className="num">Dialled</th><th className="num">Pending</th><th className="num">Reached</th><th className="num">Positive</th>
              </tr>
            </thead>
            <tbody>
              {ready && !v.camps.length && <tr><td colSpan={9} className="hs-empty">No contacts here.</td></tr>}
              {v.camps.map((c) => (
                <tr key={c.campaign}>
                  <td className="hs-who">{c.campaign || "Not filled in"}</td>
                  <td>{c.meta.product}</td><td>{c.meta.industry}</td><td>{c.meta.region}</td>
                  <td className="num">{fmt(c.given)}</td><td className="num">{fmt(c.dialled)}</td>
                  <Num v={c.pending} bad />
                  <td className="num">{fmt(c.reached)}</td><td className="num">{fmt(c.pos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hs-note">
          How names are read: the product comes first ({(data?.products || []).map((p) => p.product).join(", ") || "CCTV, NavAI, Data Transformation, Quote Buddy"}), the
          region last (India, SEA, Europe, US, Middle East), and the industry is whatever is in between. A launch date at the end is ignored. A name that
          doesn’t start with a known product is treated as an event or expo: Product = Event, Industry = Event.
        </p>
      </div>

      <div className="panel hs-card">
        <div className="hs-head">
          <h2>Lead batches from the data team</h2>
          <span>As of now · grouped by “Data added on”</span>
        </div>
        <div className="hs-scroll">
          <table>
            <thead>
              <tr>
                <th>Data added on</th><th className="num">Contacts given</th><th className="num">Dialled</th><th className="num">Pending</th>
                <th className="num">% dialled</th><th className="num">Reached</th><th className="num">Positive</th><th className="num">Bad numbers</th>
              </tr>
            </thead>
            <tbody>
              {v.batches.rows.map((b) => (
                <tr key={b.key}>
                  <td className="hs-who">{b.key === "Unknown" ? "Not filled in" : niceY(b.key)}</td>
                  <td className="num">{fmt(b.given)}</td><td className="num">{fmt(b.dialled)}</td>
                  <Num v={b.pending} bad />
                  <td className="num">{pct(b.dialled, b.given)}</td><td className="num">{fmt(b.reached)}</td>
                  <Num v={b.pos} /><Num v={b.bad} />
                </tr>
              ))}
            </tbody>
            {ready && (
              <tfoot>
                <tr>
                  <td>All batches</td>
                  <td className="num">{fmt(v.batches.tot.given)}</td><td className="num">{fmt(v.batches.tot.dialled)}</td>
                  <td className="num">{fmt(v.batches.tot.pending)}</td><td className="num">{pct(v.batches.tot.dialled, v.batches.tot.given)}</td>
                  <td className="num">{fmt(v.batches.tot.reached)}</td><td className="num">{fmt(v.batches.tot.pos)}</td>
                  <td className="num">{fmt(v.batches.tot.bad)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="hs-note">
          A contact counts once, under the date it was first given. “Pending” means no call logged yet. “Reached” means at least one connected call.
          “Bad numbers” helps judge data quality.
        </p>
      </div>
    </div>
  );
}
