import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../hooks/useIsMobile.js";
import Sheet from "./Sheet.jsx";

// Phones: a screen's own actions in the top bar — at most a couple of icon
// buttons (`icons`) plus a "⋯" button that opens a sheet with the rest
// (`menu`: [{ label, onClick, danger }]). Renders nothing on larger screens,
// where the same actions stay in the page header.
export default function TopBar({ icons = null, menu = [], title = "More actions" }) {
  const mobile = useIsMobile();
  const [slot, setSlot] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (mobile) setSlot(document.getElementById("mtop-actions"));
  }, [mobile]);
  const items = menu.filter(Boolean);
  if (!mobile || !slot) return null;
  return createPortal(
    <>
      {icons}
      {items.length > 0 && (
        <button type="button" className="mtop-btn" aria-label={title} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      )}
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <div className="menu-list">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                className={"menu-row" + (it.danger ? " danger" : "")}
                onClick={() => {
                  // Same render: the sheet closes and (say) a form opens, so the
                  // form reuses the sheet's history entry. Items open pop-ups or
                  // run actions; they don't change screens.
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>,
    slot
  );
}
