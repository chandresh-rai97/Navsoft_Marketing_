import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Phones: the floating "Add" button, bottom right above the tab bar. Lists get
// extra bottom padding while it's shown so it never covers the last item.
// Desktop keeps its "+ Task" button in the page header instead.
export default function Fab({ label, onClick }) {
  const mobile = useIsMobile();
  useEffect(() => {
    if (!mobile) return undefined;
    document.documentElement.classList.add("has-fab");
    return () => document.documentElement.classList.remove("has-fab");
  }, [mobile]);
  if (!mobile) return null;
  return createPortal(
    <button type="button" className="fab" aria-label={label} onClick={onClick}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>,
    document.body
  );
}
