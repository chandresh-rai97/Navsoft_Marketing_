import { useRef } from "react";

// Long-press (about half a second, finger kept still) as a shortcut. Returns a
// function that gives the touch handlers for one element. There is always a
// visible button for the same action — this is only an accelerator.
export function useLongPress(ms = 500) {
  const t = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  return (fn) => ({
    onPointerDown: (e) => {
      fired.current = false;
      if (e.pointerType !== "touch") return;
      start.current = [e.clientX, e.clientY];
      clearTimeout(t.current);
      t.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) navigator.vibrate(10);
        fn();
      }, ms);
    },
    onPointerMove: (e) => {
      if (!start.current) return;
      if (Math.abs(e.clientX - start.current[0]) > 10 || Math.abs(e.clientY - start.current[1]) > 10) clearTimeout(t.current);
    },
    onPointerUp: () => clearTimeout(t.current),
    onPointerCancel: () => clearTimeout(t.current),
    onContextMenu: (e) => fired.current && e.preventDefault(),
    // swallow the click that ends a long-press so it doesn't also open the task
    onClickCapture: (e) => {
      if (fired.current) {
        fired.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  });
}
