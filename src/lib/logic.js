// Domain constants and the pure rules that make this more than a to-do list.
import { clamp, todayStr } from "./format.js";

export const ROLES = ["admin", "manager", "member", "viewer"];

export const STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "done_pending_acceptance",
  "done",
  "carried_forward",
  "cancelled",
];

export const STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done_pending_acceptance: "Pending acceptance",
  done: "Done",
  carried_forward: "Carried forward",
  cancelled: "Cancelled",
};

// Statuses that count a task as still "open" / needing attention.
export const OPEN_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "carried_forward",
  "done_pending_acceptance",
];

export const CONF = ["on_track", "at_risk", "off_track"];
export const CONF_LABEL = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

export const CARRY_THRESHOLD = 3; // flag for weekly review / needs-attention
export const MOVE_REASON_AFTER = 3; // require a reason after N date moves

// ---- KR / metric maths ----
export function krProgress(k) {
  if (!k) return 0;
  if (k.target_value === k.start_value) return k.current_value >= k.target_value ? 1 : 0;
  return clamp((k.current_value - k.start_value) / (k.target_value - k.start_value), 0, 1);
}

export function taskDone(t) {
  return t.status === "done";
}

// On-time is judged against the ORIGINAL committed date, never the moved date.
export function onTime(t) {
  return (
    taskDone(t) &&
    t.completed_at &&
    t.completed_at.slice(0, 10) <= t.original_due_date
  );
}

export function isOverdue(t, today = todayStr()) {
  return OPEN_STATUSES.includes(t.status) && t.due_date < today;
}
