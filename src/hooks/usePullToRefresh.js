import { useEffect, useRef, useState } from "react";

// Installed app only (home-screen / standalone): iOS gives home-screen web apps
// no pull-to-refresh, and Android Chrome doesn't in standalone mode either. In
// a normal browser tab the browser's own pull-to-refresh is left alone.
// Pull down from the very top of a screen, past ~70px, and let go -> `onRefresh`
// (reloads the data, not the page). The same thing is always available as
// More -> Refresh data.
const THRESHOLD = 70;

function standalone() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

export function usePullToRefresh(enabled, onRefresh) {
  const [pull, setPull] = useState(0); // px pulled (0 = idle)
  const [busy, setBusy] = useState(false);
  const st = useRef(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (!enabled || !standalone()) return undefined;
    const blocked = (t) =>
      document.documentElement.classList.contains("scroll-locked") ||
      (t && t.closest && t.closest(".overlay, .sheet-overlay, .eo-wrap, .mf-chips, input, textarea, select"));
    const start = (e) => {
      if (busy || window.scrollY > 0 || e.touches.length !== 1 || blocked(e.target)) return;
      st.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false };
    };
    const move = (e) => {
      const s = st.current;
      if (!s) return;
      const dx = e.touches[0].clientX - s.x;
      const dy = e.touches[0].clientY - s.y;
      if (!s.active) {
        // mostly-vertical pulls downward only; sideways or upward = normal scrolling
        if (Math.abs(dy) < 8) return;
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { st.current = null; return; }
        s.active = true;
      }
      setPull(Math.min(110, dy * 0.55));
    };
    const end = async () => {
      const s = st.current;
      st.current = null;
      if (!s || !s.active) return;
      const go = pullRef.current >= THRESHOLD;
      setPull(0);
      if (!go) return;
      setBusy(true);
      try {
        await cb.current();
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [enabled, busy]);

  const pullRef = useRef(0);
  pullRef.current = pull;
  return { pull, busy, ready: pull >= THRESHOLD };
}
