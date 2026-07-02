import React from "react";

// The title / subtitle / action row at the top of every page (reference: setHead).
export default function PageHead({ title, sub, actions }) {
  return (
    <div className="topline">
      <div>
        <h1 className="page">{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}
