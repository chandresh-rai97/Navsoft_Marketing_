import React, { useState } from "react";
import { useIsMobile } from "../hooks/useIsMobile.js";
import Sheet from "./Sheet.jsx";

// On phones, filter rows collapse into one "Filters" button that opens a bottom
// sheet; the filters that are on show as removable chips in a row you can
// scroll sideways. On larger screens the children render exactly as before.
//   chips: [{ label, clear }] — one per active filter
export default function MobileFilters({ count = 0, chips = [], children }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!mobile) return <>{children}</>;
  const on = chips.filter(Boolean);
  return (
    <>
      <div className="mf-bar">
        <button type="button" className="btn ghost mf-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters
          {count > 0 && <span className="mf-count">{count}</span>}
        </button>
        {on.length > 0 && (
          <ul className="mf-chips" aria-label="Filters that are on">
            {on.map((c) => (
              <li key={c.label}>
                <button type="button" className="mf-chip" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                  <span>{c.label}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && (
        <Sheet
          title={"Filters" + (count > 0 ? ` · ${count} on` : "")}
          onClose={() => setOpen(false)}
          className="mf-sheet"
          footer={<button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>}
        >
          <div className="mf-body">{children}</div>
        </Sheet>
      )}
    </>
  );
}
