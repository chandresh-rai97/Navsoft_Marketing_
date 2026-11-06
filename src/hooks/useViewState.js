import { useCallback, useState } from "react";

// Like useState, but the value is remembered (in memory, for this visit) when
// you leave the screen and come back — filters, chosen tab, selected channel.
const memory = new Map();

export function useViewState(key, initial) {
  const [v, setV] = useState(() =>
    memory.has(key) ? memory.get(key) : typeof initial === "function" ? initial() : initial
  );
  const set = useCallback(
    (next) =>
      setV((prev) => {
        const val = typeof next === "function" ? next(prev) : next;
        memory.set(key, val);
        return val;
      }),
    [key]
  );
  return [v, set];
}

// Forget everything (a different person signed in).
export function clearViewState() {
  memory.clear();
}
