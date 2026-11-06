import { useEffect, useRef } from "react";
import { pushOverlay } from "../lib/router.js";

// While `open`, the browser / phone Back button calls `close` (instead of
// leaving Cadence). Closing it any other way removes the extra history entry.
export function useBackClose(open, close) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return undefined;
    return pushOverlay(() => ref.current && ref.current());
  }, [open]);
}
