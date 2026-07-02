// Date + number helpers. Dates are handled as YYYY-MM-DD strings in the local
// timezone to match how due_date / planned_for_date are compared throughout.

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function shiftStr(base, n) {
  const [y, m, dd] = base.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function daysSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function isoWeek(d = new Date()) {
  const y = d.getFullYear();
  const oneJan = new Date(y, 0, 1);
  const wk = Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function pct(n) {
  return Math.round(n * 100);
}
