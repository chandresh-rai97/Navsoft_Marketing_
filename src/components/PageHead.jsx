import React from "react";

// The title / subtitle / action row at the top of every page (reference: setHead).
// Phones hide the grey description under the title (`subPhone` keeps it when
// it carries live data rather than a description, e.g. Campaigns' totals).
export default function PageHead({ title, sub, actions, subPhone = false }) {
  return (
    <div className="topline">
      <div>
        <h1 className="page">{title}</h1>
        {sub && <div className={"sub" + (subPhone ? " keep-phone" : "")}>{sub}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}
