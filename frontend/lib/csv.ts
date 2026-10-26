import type { Col } from "./forms";

/* CSV / Excel helpers. Excel users can either save as .csv or copy cells and paste (tab-separated). */

/** Split text into rows of cells. Detects tab, semicolon or comma; handles quoted cells ("a, b", "say ""hi"""). */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n").find((l) => l.trim()) ?? "";
  const delim = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9δΔ]/gi, "");

/** Number in plain or comma-decimal form ("1234.5", "1 234,5", "+0.2"). Null when blank or not a number. */
export function parseNumber(s: string): number | null {
  const t = s.replace(/[\s ]/g, "");
  if (!t) return null;
  const n = Number(/^[+-]?\d+,\d+$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCell(col: Col, raw: string): { ok: boolean; value: unknown } {
  const s = raw.trim();
  if (s === "") return { ok: true, value: undefined };
  const t = (col.type ?? "number") as string;
  if (t === "number") { const n = parseNumber(s); return { ok: n !== null, value: n ?? undefined }; }
  if (t === "text") return { ok: true, value: s };
  const low = s.toLowerCase().replace(/[↑↓]/g, "").trim();
  if (t === "bool") {
    if (["yes", "y", "true", "1", "pass"].includes(low)) return { ok: true, value: true };
    if (["no", "n", "false", "0", "fail"].includes(low)) return { ok: true, value: false };
    return { ok: false, value: undefined };
  }
  if (t === "yesno") {
    const v = ["yes", "y"].includes(low) ? "yes" : ["no", "n"].includes(low) ? "no" : ["na", "n/a", "not applicable"].includes(low) ? "na" : null;
    return { ok: !!v, value: v ?? undefined };
  }
  // select: match the option value or its label
  const o = col.options?.find((x) => x.value.toLowerCase() === low || x.label.toLowerCase().replace(/[↑↓]/g, "").trim() === low);
  return { ok: !!o, value: o?.value };
}

export interface ImportResult {
  rows: Array<Record<string, unknown>>;
  /** Columns that were matched, in file order. */
  matched: string[];
  problems: string[];
}

/**
 * Map pasted / uploaded table text onto a form table's columns. With a header row, columns are
 * matched by key or label (units in brackets ignored, any order). Without one, columns are taken
 * in the form's order.
 */
export function importRows(cols: Col[], text: string): ImportResult {
  const grid = parseDelimited(text);
  const problems: string[] = [];
  if (!grid.length) return { rows: [], matched: [], problems: ["No data found."] };
  const find = (h: string) => cols.find((c) => norm(c.key) === norm(h) || norm(c.label) === norm(h));
  const header = grid[0].map(find);
  const hasHeader = header.filter(Boolean).length >= Math.min(2, cols.length) && grid[0].some((c) => parseNumber(c) === null);
  let map: Array<Col | undefined>;
  let body: string[][];
  if (hasHeader) {
    map = header;
    body = grid.slice(1);
    grid[0].forEach((h, k) => { if (!map[k] && h) problems.push(`Column "${h}" is not part of this table and was ignored.`); });
  } else {
    map = cols.slice(0, grid[0].length);
    body = grid;
    if (grid[0].length > cols.length) problems.push(`Only the first ${cols.length} columns were used.`);
  }
  const rows = body.map((r, ri) => {
    const out: Record<string, unknown> = {};
    map.forEach((c, k) => {
      if (!c) return;
      const { ok, value } = parseCell(c, r[k] ?? "");
      if (!ok) problems.push(`Row ${ri + 1}, ${c.label}: "${r[k]}" is not valid${c.type === "select" ? ` (use ${c.options?.map((o) => o.value).join(" / ")})` : ""}.`);
      else if (value !== undefined) out[c.key] = value;
    });
    return out;
  }).filter((r) => Object.keys(r).length);
  return { rows, matched: map.filter(Boolean).map((c) => c!.key), problems };
}

/** CSV text with a UTF-8 BOM so Excel opens accents and symbols (±, Δ) correctly. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? String(+v.toPrecision(12)) : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Header line for a table's import template: labels with units, e.g. "L (g)". */
export const templateHeader = (cols: Col[]) => cols.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label));
