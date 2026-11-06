import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Snackbar above the bottom bar: short messages, "Undo", "Couldn't save – Retry".
// Announced politely to screen readers; the timer pauses while you touch it;
// the floating Add button moves up while it's showing.
const ToastCtx = createContext({ toast: () => {}, dismiss: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [t, setT] = useState(null); // { id, message, action, ms, tone }
  const timer = useRef(null);
  const left = useRef(0);
  const since = useRef(0);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setT(null);
  }, []);
  const arm = (ms) => {
    clearTimeout(timer.current);
    left.current = ms;
    since.current = Date.now();
    timer.current = setTimeout(() => setT(null), ms);
  };
  const toast = useCallback((opts) => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    const ms = o.ms || (o.action ? 7000 : 4000);
    setT({ id: Math.random(), ...o, ms });
    arm(ms);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-snackbar", !!t);
  }, [t]);

  const pause = () => {
    if (!t) return;
    clearTimeout(timer.current);
    left.current = Math.max(1500, left.current - (Date.now() - since.current));
  };
  const resume = () => t && arm(left.current);

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="snack-live" aria-live="polite" role="status">
        {t && (
          <div
            key={t.id}
            className={"snack" + (t.tone === "error" ? " error" : "")}
            onPointerDown={pause}
            onPointerUp={resume}
            onPointerCancel={resume}
            onMouseEnter={pause}
            onMouseLeave={resume}
          >
            <span className="snack-msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="snack-btn"
                onClick={() => {
                  dismiss();
                  t.action.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="snack-x" aria-label="Dismiss" onClick={dismiss}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}
