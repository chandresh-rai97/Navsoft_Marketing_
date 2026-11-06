import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useBackClose } from "../hooks/useBackClose.js";
import Icon from "./Icon.jsx";

let locks = 0;
function lockScroll() {
  if (locks++ === 0) document.documentElement.classList.add("scroll-locked");
}
function unlockScroll() {
  if (--locks <= 0) {
    locks = 0;
    document.documentElement.classList.remove("scroll-locked");
  }
}

// Bottom sheet for short choices (filters, a task's actions, pick a date…).
// Close (✕) button, Back closes it, tap on the dim background closes it,
// focus moves in and goes back to what opened it, the page behind can't scroll.
export default function Sheet({ title, onClose, children, footer, className = "" }) {
  const id = useId();
  const ref = useRef(null);
  useBackClose(true, onClose);
  useEffect(() => {
    const prev = document.activeElement;
    lockScroll();
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        // keep keyboard focus inside the sheet
        const f = [...ref.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
      if (prev && prev.focus && document.contains(prev)) prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={"sheet " + className} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
