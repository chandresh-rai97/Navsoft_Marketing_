import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../hooks/useIsMobile.js";

// On phones, filter rows collapse into one "Filters" button that opens a panel
// from the bottom. On larger screens the children render exactly as before.
export default function MobileFilters({ count = 0, children }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!mobile) return <>{children}</>;
  return (
    <>
      <button type="button" className="btn ghost mf-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters
        {count > 0 && <span className="mf-count">{count}</span>}
      </button>
      {open &&
        createPortal(
          <div className="mf-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="mf-sheet" role="dialog" aria-label="Filters">
              <div className="mf-head">
                <strong>Filters{count > 0 ? ` · ${count} active` : ""}</strong>
              </div>
              <div className="mf-body">{children}</div>
              <div className="mf-foot">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
