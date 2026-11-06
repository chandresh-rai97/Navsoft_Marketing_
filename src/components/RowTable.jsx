import React, { useLayoutEffect, useRef } from "react";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Phones: a wide table becomes a list of rows — the first column as the row's
// title, a few key figures on one line under it, one figure on the right, and
// everything else one tap away (tap the title to expand). Larger screens get
// the table exactly as before (this renders nothing extra there).
//
//   title  column index used as the row title (default 0)
//   meta   column indexes shown under the title, e.g. [1, 2]
//   side   column index shown on the right
//   stack  show every column, labelled, one under the other (editable tables)
export default function RowTable({ title = 0, meta = [], side = null, stack = false, children }) {
  const mobile = useIsMobile();
  const ref = useRef(null);

  // Label every cell with its column header and its role in the phone layout.
  useLayoutEffect(() => {
    if (!mobile || !ref.current) return;
    const table = ref.current.querySelector("table");
    if (!table) return;
    const head = table.tHead?.rows[table.tHead.rows.length - 1];
    const labels = head ? [...head.cells].map((c) => c.textContent.trim()) : [];
    const rows = [...(table.tBodies[0]?.rows || []), ...(table.tFoot?.rows || [])];
    rows.forEach((tr) => {
      const cells = [...tr.cells];
      if (cells.length === 1 && cells[0].colSpan > 1) {
        cells[0].dataset.rt = "full";
        return;
      }
      let more = false;
      cells.forEach((td, i) => {
        td.dataset.label = labels[i] || "";
        const role = stack
          ? i === title ? "title" : "stack"
          : i === title ? "title" : i === side ? "side" : meta.includes(i) ? "meta" : "more";
        td.dataset.rt = role;
        if (role === "more" && (td.textContent.trim() || td.querySelector("a,button,input,select"))) more = true;
      });
      const t = cells[title];
      if (t && more) {
        t.setAttribute("role", "button");
        t.tabIndex = 0;
        t.setAttribute("aria-expanded", tr.dataset.open === "1" ? "true" : "false");
        tr.dataset.expandable = "1";
      } else if (t) {
        t.removeAttribute("role");
        t.removeAttribute("tabindex");
        t.removeAttribute("aria-expanded");
        delete tr.dataset.expandable;
      }
    });
  });

  if (!mobile) return children;

  const toggle = (e) => {
    const td = e.target.closest('td[data-rt="title"][role="button"]');
    if (!td || e.target.closest("a, button, input, select, textarea, label")) return;
    if (e.type === "keydown") {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
    }
    const tr = td.parentElement;
    const open = tr.dataset.open === "1";
    tr.dataset.open = open ? "0" : "1";
    td.setAttribute("aria-expanded", open ? "false" : "true");
  };

  return (
    <div ref={ref} className={"rt" + (stack ? " rt-stack" : "")} onClick={toggle} onKeyDown={toggle}>
      {children}
    </div>
  );
}
