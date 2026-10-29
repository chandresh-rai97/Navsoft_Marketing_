import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import {
  PRESETS,
  activeOn,
  fmtNum,
  fmtRate,
  fmtUpdated,
  loadCampaignData,
  longDay,
  rangeFor,
  rangeLabel,
  rates,
  regionTable,
  regionsInData,
  runSync,
  scoped,
  shortDay,
  todayIST,
  topCampaigns,
  total,
  trendDays,
  weakestCampaigns,
  wentLive,
} from "../lib/instantly.js";

const RECENT_MS = 10 * 60 * 1000;

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

function Stat({ value, label, sub, alert }) {
  return (
    <div className={"stat" + (alert ? " alert" : "")}>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
      {sub != null && <div className="ix-sub">{sub}</div>}
    </div>
  );
}

function Name({ c }) {
  return (
    <>
      {c.campaign}
      {c.deleted && <span className="ix-del">Deleted in Instantly</span>}
    </>
  );
}

const redIf = (rate) => "num" + (rate != null && rate > 0.05 ? " ix-red" : "");

function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? "ix-spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

// ---- Emails sent per day (bar chart with hover tooltip) ----
function niceStep(max, count) {
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  return pow * (err >= 7.07 ? 10 : err >= 3.16 ? 5 : err >= 1.41 ? 2 : 1);
}

function TrendChart({ days }) {
  const box = useRef(null);
  const [W, setW] = useState(600);
  const [tip, setTip] = useState(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(el.clientWidth || 600, 280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 220, top = 10, bottom = 26;
  const maxSent = Math.max(1, ...days.map((d) => d.sent));
  const step = niceStep(maxSent, 4);
  const yMax = Math.ceil(maxSent / step) * step;
  const ticks = [];
  for (let v = 0; v <= yMax + step / 2; v += step) ticks.push(v);
  const y = (v) => H - bottom - (v / yMax) * (H - bottom - top);
  const left = fmtNum(yMax).length * 6.6 + 10;
  const n = Math.max(days.length, 1);
  const band = (W - 8 - left) / (n + 0.2);
  const bw = band * 0.8;
  const x = (i) => left + band * 0.2 + i * band;
  const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor((W - left) / 64))));

  function move(e, d) {
    const r = box.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setTip({ d, left: Math.min(Math.max(0, mx + 12), r.width - 130), top: Math.max(0, my - 40) });
  }

  return (
    <div className="ix-chart" ref={box}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Emails sent per day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % every === 0 ? (
            <text key={"x" + d.date} x={x(i) + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {shortDay(d.date)}
            </text>
          ) : null
        )}
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={x(i)}
            width={bw}
            y={y(d.sent)}
            height={Math.max(0, y(0) - y(d.sent))}
            rx={Math.min(4, bw / 2)}
            fill="var(--accent)"
            onMouseMove={(e) => move(e, d)}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </svg>
      {tip && (
        <div className="ix-tip" style={{ left: tip.left, top: tip.top }}>
          <div className="d">{longDay(tip.d.date)}</div>
          <div>{fmtNum(tip.d.sent)} sent</div>
          <div>{fmtNum(tip.d.replies)} replies</div>
        </div>
      )}
    </div>
  );
}

export default function Campaigns() {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState("overview");
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState({ start: null, end: null });
  const [region, setRegion] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncErr, setSyncErr] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await loadCampaignData());
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
    const t = setTimeout(() => setSyncMsg(""), 8000);
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
      const res = await runSync();
      if (res?.status === "skipped") setSyncMsg("Updated a few minutes ago");
      await reload();
    } catch (e) {
      setSyncErr("Refresh failed: " + (e.message || e));
    } finally {
      setSyncing(false);
    }
  }

  const today = todayIST();
  const [from, to] = rangeFor(preset, custom.start, custom.end, today);
  const daily = data?.daily || [];
  const ready = !!data;

  const v = useMemo(() => {
    const rows = scoped(daily, from, to, region);
    const t = total(rows);
    const todayRows = scoped(daily, today, today, region);
    return {
      rows,
      t,
      r: rates(t),
      camps: new Set(rows.filter((r) => r.sent > 0).map((r) => r.campaign_id)).size,
      regions: regionTable(rows),
      top: topCampaigns(rows),
      weak: weakestCampaigns(rows),
      trend: trendDays(daily, from, to, region),
      todayT: total(todayRows),
      live: wentLive(daily, today, region),
      active: activeOn(todayRows),
      regionPills: regionsInData(daily),
    };
  }, [daily, from, to, region, today]);

  const dash = (s) => (ready ? s : "—");

  function pickPreset(p) {
    if (p === "custom") {
      setCustom({ start: from, end: to });
      setPreset("custom");
      setTab("overview");
      return;
    }
    setPreset(p);
    setTab(p === "today" ? "today" : "overview");
  }
  function pickTab(next) {
    setTab(next);
    if (next === "today") setPreset("today");
  }
  function pickDate(which, value, valid) {
    if (!value || !valid) return;
    const start = which === "start" ? value : from || value;
    const end = which === "end" ? value : to;
    setCustom({ start, end: end < start ? start : end });
    setPreset("custom");
    setTab("overview");
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
        title={syncing ? "Refreshing…" : "Refresh from Instantly"}
        aria-label={syncing ? "Refreshing" : "Refresh from Instantly"}
      >
        <RefreshIcon spinning={syncing} />
      </button>
    </div>
  );

  return (
    <div className="ix">
      <PageHead
        title="Instantly campaigns by region"
        sub={
          <>
            {rangeLabel(preset, from, to)}: <b>{dash(fmtNum(v.t.sent))}</b> emails sent across{" "}
            <b>{dash(fmtNum(v.camps))}</b> campaigns, with <b>{dash(fmtNum(v.t.replies))}</b> replies and a{" "}
            <b>{dash(fmtRate(v.r.bounce))}</b> bounce rate.
          </>
        }
        actions={header}
      />

      {loadErr && <div className="note ix-errnote">Couldn't load campaign data: {loadErr}</div>}
      {ready && !daily.length && (
        <div className="note">No Instantly data yet. Press the refresh button at the top right to run the first sync.</div>
      )}

      <div className="panel ix-bar">
        <div className="ix-row">
          <Seg label="View" options={[["overview", "Overview"], ["today", "Today"]]} value={tab} onChange={pickTab} />
        </div>
        <div className="ix-row">
          <span className="ix-lbl">Date range</span>
          <Seg label="Date range" options={PRESETS} value={preset} onChange={pickPreset} />
          <label className="ix-date">
            <span className="ix-lbl">From</span>
            <input type="date" min="2020-01-01" max="2099-12-31" aria-label="From" value={from || ""}
              onChange={(e) => pickDate("start", e.target.value, e.target.validity.valid)} />
          </label>
          <label className="ix-date">
            <span className="ix-lbl">To</span>
            <input type="date" min="2020-01-01" max="2099-12-31" aria-label="To" value={to}
              onChange={(e) => pickDate("end", e.target.value, e.target.validity.valid)} />
          </label>
        </div>
        <div className="ix-row">
          <span className="ix-lbl">Region</span>
          {ready ? (
            <Seg label="Region" options={[[null, "All regions"], ...v.regionPills.map((r) => [r, r])]} value={region} onChange={setRegion} />
          ) : (
            "—"
          )}
        </div>
      </div>

      {tab === "overview" ? (
        <section>
          <div className="ix-sec">
            <h2>Headline numbers</h2>
            <p>Rates are per email sent in the selected dates and region</p>
            <div className="cards ix-kpis">
              <Stat value={dash(fmtNum(v.t.sent))} label="Emails sent" sub="all steps, incl. follow-ups" />
              <Stat value={dash(fmtNum(v.t.new_leads))} label="New leads reached" sub="first email to a lead" />
              <Stat value={dash(fmtRate(v.r.open))} label="Open rate" sub="unique opens ÷ sent" />
              <Stat value={dash(fmtRate(v.r.click))} label="Click rate" sub="unique clicks ÷ sent" />
              <Stat value={dash(fmtNum(v.t.replies))} label="Replies" sub={`${dash(fmtRate(v.r.reply))} of sent`} />
              <Stat value={dash(fmtRate(v.r.bounce))} label="Bounce rate" sub="above 5% hurts sender reputation"
                alert={ready && v.r.bounce != null && v.r.bounce > 0.05} />
            </div>
          </div>

          <div className="ix-sec">
            <h2>Regions side by side</h2>
            <p>Each region's campaigns in the selected dates · bounce rates above 5% in red</p>
            <div className="panel ix-scroll">
              <table className="ix-table">
                <thead>
                  <tr>
                    <th>Region</th><th className="num">Campaigns</th><th className="num">Sent</th><th className="num">Open rate</th>
                    <th className="num">Click rate</th><th className="num">Replies</th><th className="num">Reply rate</th><th className="num">Bounce rate</th>
                  </tr>
                </thead>
                <tbody>
                  {v.regions.map((g) => (
                    <tr key={g.key}>
                      <td>{g.key}</td>
                      <td className="num">{fmtNum(g.campaigns)}</td>
                      <td className="num">{fmtNum(g.sent)}</td>
                      <td className="num">{fmtRate(g.open)}</td>
                      <td className="num">{fmtRate(g.click)}</td>
                      <td className="num">{fmtNum(g.replies)}</td>
                      <td className="num">{fmtRate(g.reply)}</td>
                      <td className={redIf(g.bounce)}>{fmtRate(g.bounce)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ready && !v.regions.length && <p className="ix-empty">No emails were sent in these dates.</p>}
            </div>
          </div>

          <div className="ix-sec">
            <h2>Emails sent per day</h2>
            <p>Hover a bar for that day's sends and replies</p>
            <div className="panel">{ready ? <TrendChart days={v.trend} /> : "—"}</div>
          </div>

          <div className="grid2">
            <div className="panel">
              <h2>Top campaigns</h2>
              <p className="ix-note">Top 10 by unique clicks in the selected dates</p>
              <div className="ix-scroll">
                <table className="ix-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th className="ix-hide">Region</th><th className="num">Sent</th>
                      <th className="num">Unique clicks</th><th className="num">Click rate</th><th className="num">Replies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.top.map((c) => (
                      <tr key={c.key}>
                        <td className="ix-name"><Name c={c} /></td>
                        <td className="ix-hide">{c.region}</td>
                        <td className="num">{fmtNum(c.sent)}</td>
                        <td className="num">{fmtNum(c.unique_clicks)}</td>
                        <td className="num">{fmtRate(c.click)}</td>
                        <td className="num">{fmtNum(c.replies)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ready && !v.top.length && <p className="ix-empty">No campaigns sent emails in these dates.</p>}
              </div>
            </div>
            <div className="panel">
              <h2>Weakest campaigns</h2>
              <p className="ix-note">5 weakest of those that sent 200+ emails · score 0–100, higher is worse</p>
              <div className="ix-scroll">
                <table className="ix-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th className="num">Open rate</th><th className="num">Click rate</th>
                      <th className="num">Bounce rate</th><th className="num">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.weak.map((c) => (
                      <tr key={c.key}>
                        <td className="ix-name"><Name c={c} /></td>
                        <td className="num">{fmtRate(c.open)}</td>
                        <td className="num">{fmtRate(c.click)}</td>
                        <td className={redIf(c.bounce)}>{fmtRate(c.bounce)}</td>
                        <td className="num">{c.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ready && !v.weak.length && <p className="ix-empty">No campaign sent 200+ emails in these dates.</p>}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <div className="ix-sec">
            <h2>Today, {longDay(today)}</h2>
            <p>
              Activity recorded today in the selected region · the date range above doesn't apply here · today's figures
              cover activity up to the last refresh{data?.lastUpdated ? ` (${fmtUpdated(data.lastUpdated)})` : ""}
            </p>
            <div className="cards ix-kpis">
              <Stat value={dash(fmtNum(v.todayT.sent))} label="Emails sent" />
              <Stat value={dash(fmtNum(v.todayT.new_leads))} label="New leads reached" />
              <Stat value={dash(fmtNum(v.todayT.unique_opens))} label="Unique opens" />
              <Stat value={dash(fmtNum(v.todayT.unique_clicks))} label="Unique clicks" />
              <Stat value={dash(fmtNum(v.todayT.replies))} label="Replies" />
              <Stat value={dash(fmtNum(v.todayT.bounced))} label="Bounces" />
            </div>
          </div>
          <div className="grid2">
            <div className="panel">
              <h2>Went live today</h2>
              <p className="ix-note">Campaigns whose first emails went out today</p>
              <ul className="ix-live">
                {v.live.map((c) => (
                  <li key={c.campaign_id}>
                    {c.campaign} · {c.region}
                    {c.deleted && <span className="ix-del">Deleted in Instantly</span>}
                  </li>
                ))}
              </ul>
              {ready && !v.live.length && <p className="ix-empty">No campaigns went live today.</p>}
            </div>
            <div className="panel">
              <h2>Campaigns active today</h2>
              <p className="ix-note">Every campaign with any activity today, most emails sent first</p>
              <div className="ix-scroll">
                <table className="ix-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th className="ix-hide">Region</th><th className="num">Sent</th><th className="num">Opens</th>
                      <th className="num">Clicks</th><th className="num">Replies</th><th className="num">Bounces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.active.map((c) => (
                      <tr key={c.key}>
                        <td className="ix-name"><Name c={c} /></td>
                        <td className="ix-hide">{c.region}</td>
                        <td className="num">{fmtNum(c.sent)}</td>
                        <td className="num">{fmtNum(c.unique_opens)}</td>
                        <td className="num">{fmtNum(c.unique_clicks)}</td>
                        <td className="num">{fmtNum(c.replies)}</td>
                        <td className="num">{fmtNum(c.bounced)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ready && !v.active.length && <p className="ix-empty">No activity recorded today yet.</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      <details className="ix-method">
        <summary>How this was put together</summary>
        <ul>
          <li>Numbers come from Instantly's daily campaign analytics, so a date range counts the activity that happened in those days, whenever the campaign started.</li>
          <li>Rates are per email sent, including follow-ups. Unique opens and clicks are counted per day, so a lead who opens on two days counts twice across a range.</li>
          <li>Region comes from the tag in brackets in each campaign name: (India), (Ind) or (Chennai) is India; (SEA) is South East Asia; (Europe), (EU) or (UK) is Europe; (US) or (USA) is US; (ME), (MENA), (UAE), (KSA), (GCC), (Dubai), (Qatar) or (Saudi) is Middle East. A new tag the page doesn't know shows as its own region marked "unmapped", and a name with no tag is "Unassigned".</li>
          <li>Weakness score: among campaigns that sent 200 or more emails in the dates and region chosen, each is ranked on open rate (lower is worse), click rate (lower is worse) and bounce rate (higher is worse); the score is the average of the three ranks.</li>
          <li>"Went live today" means the campaign's first emails were sent today. Days follow Instantly's own day boundaries, so a send late in the evening India time can fall on the next day.</li>
          <li>Opens and clicks include some automated activity from security scanners and Apple Mail privacy features, so read them as relative signals.</li>
        </ul>
      </details>
    </div>
  );
}
