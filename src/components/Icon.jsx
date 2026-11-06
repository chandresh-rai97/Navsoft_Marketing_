import React from "react";

// Line icons in the same style as the app's existing inline SVGs (Filters,
// eye, refresh): 24px grid, 2px round strokes, currentColor. `filled` draws the
// solid version used for the active bottom tab.
const P = {
  sun: {
    line: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    fill: (
      <>
        <circle cx="12" cy="12" r="5" fill="currentColor" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  checks: {
    line: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
      </>
    ),
    fill: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" />
        <path d="M8 12.5l2.5 2.5L16 9.5" stroke="var(--icon-cut)" />
      </>
    ),
  },
  bell: {
    line: (
      <>
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
    fill: (
      <>
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" fill="currentColor" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
  },
  octagon: {
    line: (
      <>
        <path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2z" />
        <path d="M12 7.5v5M12 16.2v.3" />
      </>
    ),
    fill: (
      <>
        <path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2z" fill="currentColor" />
        <path d="M12 7.5v5M12 16.2v.3" stroke="var(--icon-cut)" />
      </>
    ),
  },
  grid: {
    line: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </>
    ),
    fill: (
      <g fill="currentColor">
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </g>
    ),
  },
  list: {
    line: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
      </>
    ),
    fill: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" strokeWidth="3" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="4.5" />
      </>
    ),
  },
  accept: {
    line: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.7 2.7L16.2 9.6" />
      </>
    ),
    fill: (
      <>
        <circle cx="12" cy="12" r="9.5" fill="currentColor" />
        <path d="M8 12.5l2.7 2.7L16.2 9.6" stroke="var(--icon-cut)" />
      </>
    ),
  },
  people: {
    line: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.3 3.5 5.2" />
      </>
    ),
    fill: (
      <>
        <circle cx="9" cy="8" r="3.8" fill="currentColor" />
        <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5z" fill="currentColor" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.3 3.5 5.2" />
      </>
    ),
  },
  more: {
    line: (
      <>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </>
    ),
    fill: (
      <g fill="currentColor">
        <circle cx="5" cy="12" r="2.2" />
        <circle cx="12" cy="12" r="2.2" />
        <circle cx="19" cy="12" r="2.2" />
      </g>
    ),
  },
  back: { line: <path d="M15 5l-7 7 7 7" /> },
  chevron: { line: <path d="M9 5l7 7-7 7" /> },
  refresh: {
    line: (
      <>
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </>
    ),
  },
  close: { line: <path d="M6 6l12 12M18 6L6 18" /> },
};

export default function Icon({ name, filled = false, size = 24, className = "" }) {
  const def = P[name];
  if (!def) return null;
  return (
    <svg
      className={"icon " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {filled && def.fill ? def.fill : def.line}
    </svg>
  );
}
