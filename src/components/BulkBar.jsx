import React from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

// Phones, select mode: replaces the bottom tab bar with the count and the
// bulk actions. Delete (admins) sits apart from the others.
export default function BulkBar({ count, onExit, onReassign, onReschedule, onDelete }) {
  const none = count === 0;
  return createPortal(
    <div className="bulkbar" role="toolbar" aria-label="Selected tasks">
      <button type="button" className="bulkbar-x" aria-label="Stop selecting" onClick={onExit}>
        <Icon name="close" />
      </button>
      <span className="bulkbar-n" aria-live="polite">{count} selected</span>
      <button type="button" className="bulkbar-btn" disabled={none} onClick={onReassign}>Reassign</button>
      <button type="button" className="bulkbar-btn" disabled={none} onClick={onReschedule} aria-label="Reschedule (change due date)">Date</button>
      {onDelete && (
        <button type="button" className="bulkbar-btn danger" disabled={none} onClick={onDelete}>Delete</button>
      )}
    </div>,
    document.body
  );
}
