import React from "react";

// Phones: while the workspace loads, show the shape of the screen (top bar,
// a few rows, tab bar) instead of a line of text. Purely visual.
export default function LoadingSkeleton() {
  return (
    <div className="skel" role="status" aria-label="Loading your workspace">
      <div className="skel-top" />
      <div className="skel-body">
        <div className="skel-line w60" />
        <div className="skel-line w40" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel-card">
            <div className="skel-line w70" />
            <div className="skel-line w45" />
          </div>
        ))}
      </div>
      <div className="skel-tabs" />
    </div>
  );
}
