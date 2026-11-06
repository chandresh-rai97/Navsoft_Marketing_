import React, { useEffect, useRef } from "react";
import { useBackClose } from "../hooks/useBackClose.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import Icon from "./Icon.jsx";

// Generic modal wrapper: dim overlay + centered card. Click-outside / Esc close.
// Back (browser or phone) also closes it; `noHistory` is for the task view,
// whose open state already lives in the URL.
// Phones: it's a full-screen page with a Back button at the top left; the page
// behind can't scroll. Focus moves into it and returns to the button that
// opened it.
export default function Modal({ children, onClose, wide = false, noHistory = false }) {
  const mobile = useIsMobile();
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useBackClose(!noHistory, onClose);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!mobile) return undefined;
    document.documentElement.classList.add("scroll-locked");
    return () => document.documentElement.classList.remove("scroll-locked");
  }, [mobile]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={"modal" + (wide ? " wide" : "")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {mobile && (
          <div className="modal-bar">
            <button type="button" className="modal-back" aria-label="Back" onClick={onClose}>
              <Icon name="back" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
