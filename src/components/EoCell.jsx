import React from "react";
import { fmtNum } from "../lib/eo.js";

// One user-editable numeric cell. Uncontrolled + commit on blur; remounts after
// a save (key includes the stored value) so it reflects the refreshed value.
export default function EoCell({ value, canEdit, onCommit }) {
  if (!canEdit) return <span className="eo-auto">{fmtNum(value)}</span>;
  return (
    <input
      className="eo-in"
      type="number"
      step="any"
      key={value === null || value === undefined ? "empty" : String(value)}
      defaultValue={value === null || value === undefined ? "" : value}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const v = raw === "" ? null : Number(raw);
        if (raw !== "" && Number.isNaN(v)) return;
        if ((value ?? null) !== (v ?? null)) onCommit(v);
      }}
    />
  );
}
