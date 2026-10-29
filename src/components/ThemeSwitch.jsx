import React, { useEffect, useState } from "react";

// Light | Dark | System. The choice is saved in localStorage ("cadence-theme")
// and applied as data-theme on <html>; index.html applies it before the app
// loads so there's no flash of the wrong theme.
const KEY = "cadence-theme";
const OPTIONS = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
];

function readChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

function apply(choice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export default function ThemeSwitch() {
  const [choice, setChoice] = useState(readChoice);

  useEffect(() => {
    apply(choice);
    if (choice !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function pick(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
    setChoice(v);
  }

  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {OPTIONS.map(([v, label]) => (
        <button key={v} type="button" className={choice === v ? "on" : ""} aria-pressed={choice === v} onClick={() => pick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
