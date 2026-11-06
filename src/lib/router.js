// Cadence's small URL router (History API, no library).
//
// - Every screen has a path (PATHS). An open task adds ?task=<id> (or "new").
// - Sheets, dialogs and pop-ups add a history entry *without* changing the URL,
//   so the browser / phone Back button closes them instead of leaving Cadence.
// - Closing a sheet with its own button removes that history entry again.
//
// History entries carry { cadence: true, k, idx, ov }:
//   k   = unique key (used to remember scroll position)
//   idx = how many in-app screens deep we are (0 = the first page loaded)
//   ov  = how many sheets/dialogs are open on top of the screen

export const PATHS = {
  myday: "/my-day",
  mytasks: "/my-tasks",
  notifications: "/notifications",
  myweek: "/my-week",
  blockers: "/blockers",
  dashboard: "/dashboard",
  alltasks: "/tasks",
  acceptance: "/acceptance",
  done: "/done",
  people: "/people",
  grid: "/projects",
  efforts: "/efforts",
  campaigns: "/campaigns",
  hubspot: "/hubspot",
  coldcalling: "/cold-calling",
  settings: "/settings",
  more: "/more",
};
const VIEW_BY_PATH = Object.fromEntries(Object.entries(PATHS).map(([v, p]) => [p, v]));

// URL -> { view, arg, task }. view is null for "/" or an unknown path.
export function parseLocation(loc = window.location) {
  const q = new URLSearchParams(loc.search);
  let path = loc.pathname.replace(/\/+$/, "") || "/";
  let view = VIEW_BY_PATH[path] || null;
  let arg = null;
  const m = path.match(/^\/projects\/([^/]+)$/);
  if (m) {
    view = "grid";
    arg = { project: decodeURIComponent(m[1]) };
  } else if (view === "efforts" && q.get("project")) {
    arg = { project: q.get("project") };
  } else if (view === "alltasks" && (q.get("project") || q.get("kr"))) {
    arg = { project: q.get("project") || "", kr: q.get("kr") || "" };
  }
  return { view, arg, task: q.get("task") || null };
}

export function buildUrl(view, arg = null, task = null) {
  let path = PATHS[view] || "/";
  const q = new URLSearchParams();
  if (view === "grid" && arg?.project) path = `/projects/${encodeURIComponent(arg.project)}`;
  else if (view === "efforts" && arg?.project) q.set("project", arg.project);
  else if (view === "alltasks" && arg) {
    if (arg.project) q.set("project", arg.project);
    if (arg.kr) q.set("kr", arg.kr);
  }
  if (task) q.set("task", task);
  const qs = q.toString();
  return path + (qs ? "?" + qs : "") + window.location.hash;
}

// ---------------------------------------------------------------------------
// History bookkeeping shared by routes and overlays.

const newKey = () => Math.random().toString(36).slice(2, 10);
const cur = () => (window.history.state && window.history.state.cadence ? window.history.state : null);

let pendingBacks = 0; // stale overlay entries waiting to be removed with history.go(-n)
let skipPops = 0; // popstate events we caused ourselves and must ignore
const overlays = []; // open sheets/dialogs, bottom to top: { close, popped }
const listeners = new Set(); // route listeners (App)
const scrolls = new Map(); // k -> scrollY

export function initHistory() {
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  if (!cur()) window.history.replaceState({ cadence: true, k: newKey(), idx: 0, ov: 0 }, "");
  window.addEventListener("popstate", onPop);
}

function onPop() {
  if (skipPops > 0) {
    skipPops--;
    return;
  }
  const depth = cur()?.ov || 0;
  while (overlays.length > depth) {
    const o = overlays.pop();
    o.popped = true;
    o.close();
  }
  listeners.forEach((fn) => fn());
}

function flush() {
  if (pendingBacks <= 0) return;
  const n = pendingBacks;
  pendingBacks = 0;
  skipPops++;
  window.history.go(-n);
}

// Push a history entry. If a just-closed sheet left a stale entry behind,
// reuse it (replace) instead, so a later history.go(-n) can't undo this push.
function push(state, url) {
  if (pendingBacks > 0) {
    pendingBacks--;
    window.history.replaceState(state, "", url);
  } else {
    window.history.pushState(state, "", url);
  }
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentKey() {
  return cur()?.k || null;
}
export function canGoBackInApp() {
  return (cur()?.idx || 0) > 0;
}

// Go to a screen (adds a history entry).
export function pushRoute(view, arg = null) {
  const s = cur();
  if (s) scrolls.set(s.k, window.scrollY);
  push({ cadence: true, k: newKey(), idx: (s?.idx || 0) + 1, ov: 0 }, buildUrl(view, arg));
}

// Fix the URL without adding history (e.g. a screen you can't see -> your home).
export function replaceRoute(view, arg = null, task = null) {
  const s = cur();
  window.history.replaceState({ ...(s || {}), cadence: true, k: s?.k || newKey(), idx: s?.idx || 0, ov: s?.ov || 0 }, "", buildUrl(view, arg, task));
}

export function savedScroll(k) {
  return scrolls.get(k);
}

// Open a task on top of the current screen: ?task=<id>.
export function pushTask(view, arg, id) {
  const s = cur();
  push({ cadence: true, k: s?.k || newKey(), idx: s?.idx || 0, ov: 0, task: true }, buildUrl(view, arg, id));
}

// Close the open task. If we opened it (pushed), step back; if the page was
// loaded with ?task=, just drop the parameter.
export function closeTask(view, arg) {
  if (cur()?.task) {
    pendingBacks++;
    setTimeout(flush, 0);
  } else {
    replaceRoute(view, arg);
  }
}

// A sheet/dialog opened: add a history entry (same URL) so Back closes it.
// Returns a function to call when it's closed by its own button / unmounted.
export function pushOverlay(close) {
  const o = { close, popped: false };
  overlays.push(o);
  const s = cur() || {};
  push({ ...s, cadence: true, k: s.k || newKey(), idx: s.idx || 0, ov: overlays.length }, window.location.href);
  return () => {
    if (o.popped) return;
    o.popped = true;
    const i = overlays.indexOf(o);
    if (i >= 0) overlays.splice(i, 1);
    pendingBacks++;
    setTimeout(flush, 0);
  };
}
