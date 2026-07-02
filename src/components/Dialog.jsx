import React, { createContext, useContext, useState, useCallback } from "react";

// Imperative alert / confirm / prompt that return promises — mirrors the
// reference's alertDlg / confirmDlg / promptDlg.
const DialogCtx = createContext(null);
export const useDialog = () => useContext(DialogCtx);

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null); // {kind, message, resolve, value}

  const close = useCallback((result) => {
    setDlg((cur) => {
      if (cur) cur.resolve(result);
      return null;
    });
  }, []);

  const api = {
    alert: (message) =>
      new Promise((resolve) => setDlg({ kind: "alert", message, resolve })),
    confirm: (message) =>
      new Promise((resolve) => setDlg({ kind: "confirm", message, resolve })),
    prompt: (message, initial = "") =>
      new Promise((resolve) =>
        setDlg({ kind: "prompt", message, resolve, value: initial })
      ),
  };

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {dlg && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close(dlg.kind === "confirm" ? false : dlg.kind === "prompt" ? null : undefined)}>
          <div className="modal" style={{ width: 400 }} onMouseDown={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 16px" }}>{dlg.message}</p>
            {dlg.kind === "prompt" && (
              <textarea
                autoFocus
                defaultValue={dlg.value}
                onChange={(e) => (dlg.value = e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 56,
                  padding: 8,
                  border: "1px solid var(--line)",
                  borderRadius: 7,
                  fontFamily: "var(--sans)",
                  marginBottom: 4,
                }}
              />
            )}
            <div className="modal-actions">
              {dlg.kind !== "alert" && (
                <button
                  className="btn ghost"
                  onClick={() => close(dlg.kind === "confirm" ? false : null)}
                >
                  Cancel
                </button>
              )}
              <button
                className="btn"
                onClick={() =>
                  close(
                    dlg.kind === "confirm"
                      ? true
                      : dlg.kind === "prompt"
                      ? (dlg.value || "").trim()
                      : undefined
                  )
                }
              >
                {dlg.kind === "alert" ? "OK" : dlg.kind === "confirm" ? "Confirm" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}
