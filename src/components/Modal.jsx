import React, { useEffect } from "react";
import { useBackClose } from "../hooks/useBackClose.js";

// Generic modal wrapper: dim overlay + centered card. Click-outside / Esc close.
// Back (browser or phone) also closes it; `noHistory` is for the task view,
// whose open state already lives in the URL.
export default function Modal({ children, onClose, wide = false, noHistory = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useBackClose(!noHistory, onClose);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={"modal" + (wide ? " wide" : "")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
