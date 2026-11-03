import { useEffect, useState } from "react";

// Phone layout: screens narrower than 768px (matches the CSS breakpoint).
export const MOBILE_QUERY = "(max-width: 767.98px)";

export function useIsMobile() {
  const get = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}
