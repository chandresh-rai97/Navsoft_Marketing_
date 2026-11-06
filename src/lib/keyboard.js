// On phones the on-screen keyboard only shrinks the *visual* viewport on iOS,
// so things pinned to the bottom (a form's Save bar, a sheet) end up behind
// it. Track how much of the screen the keyboard covers in --kb so those can
// sit above it. (Android with interactive-widget=resizes-content gives 0.)
export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty("--kb", kb > 60 ? kb + "px" : "0px");
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
  // Keep the field you're typing in visible above the keyboard and sticky bars.
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!el.matches || !el.matches("input, textarea, select")) return;
    setTimeout(() => {
      if (document.activeElement === el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }, 300);
  });
}
