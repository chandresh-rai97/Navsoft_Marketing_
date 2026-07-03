// Minimal, dependency-free CSV parser that handles the tricky bits from
// Google Sheets exports: quoted fields, commas and newlines inside quotes,
// escaped double-quotes (""), a leading BOM, and CRLF line endings.

export function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // flush the final field/row
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Build a CSV string from a header array + array of row arrays (with quoting).
export function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

// Trigger a browser download of a text file (used for CSV exports/templates).
export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Parse into an array of objects keyed by the header row. Blank lines dropped.
export function parseCSVObjects(text) {
  const rows = parseCSV(text).filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (rows.length < 1) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => (h ?? "").trim());
  const objs = rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, idx) => {
      o[h] = (r[idx] ?? "").trim();
    });
    return o;
  });
  return { headers, rows: objs };
}
