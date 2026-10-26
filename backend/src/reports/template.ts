import { toProfile } from "../lib/compute";
import { errorChartSvg } from "./chart";
import { L, bi } from "./i18n";

export interface ReportData {
  lab: any;
  c: any;
  pack: any;
  validation: any;
  sessions: any[];
  weights: any[];
  equipment: any[];
  attachments: Array<{ category: string; filename: string; caption?: string; sha256: string; dataUrl?: string }>;
  reportNo: string;
  verifyId: string;
  verifyUrl: string;
  qrDataUrl: string;
  signedAt: Date;
  /** Set when this report is a revision that supersedes an earlier report of the same case. */
  revisionOf?: { reportNo: string; revision: number; reason: string };
  /** Lab signing key ID (Ed25519); absent on drafts. */
  keyId?: string;
  people: { engineer?: any; reviewer?: any; approver?: any };
}

/** Dates in Indian format and time zone, e.g. "25 Sep 2026" / "25 Sep 2026, 02:03 PM IST". */
export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
export const fmtDateTime = (d: Date | string) => `${new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} IST`;
const CATEGORY: Record<string, string> = {
  INSTRUMENT_PHOTO: "Instrument photograph", NAMEPLATE: "Nameplate / markings", SEALING: "Sealing provisions",
  TEST_SETUP: "Test set-up photograph", MANUAL: "Operating manual", CERTIFICATE: "Component certificate", OTHER: "Other",
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function fmtMass(g: number | null | undefined): string {
  if (g === null || g === undefined || !Number.isFinite(g)) return "—";
  const a = Math.abs(g);
  if (a >= 1000 && a % 1 === 0 && a % 1000 === 0) return `${g / 1000} kg`;
  if (a >= 1000) return `${+(g / 1000).toPrecision(10)} kg`;
  if (a > 0 && a < 1) return `${+(g * 1000).toPrecision(10)} mg`;
  return `${+g.toPrecision(10)} g`;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(+v.toPrecision(10)) : v === null || v === undefined ? "—" : esc(v));

const badge = (v: string) => `<span class="badge b-${esc(v)}">${esc(L[v as keyof typeof L]?.[0] ?? v)}</span>`;

/** Column spec: which row keys to show for test tables, in order. */
const COLS: Array<[string, string]> = [
  ["position", "Position"], ["direction", "Direction"], ["phase", "Phase"], ["condition", "Condition"], ["disturbance", "Disturbance"],
  ["series", "Series"], ["kind", "Kind"], ["mode", "Mode"], ["t_min", "t (min)"], ["T_C", "T (°C)"], ["RH_pct", "RH (%)"], ["tare_g", "Tare (g)"], ["label", "Item"],
  ["range_g", "Range (g)"], ["pct", "% of Max"], ["limit_pct", "Limit (% Max)"],
  ["L", "Load L (g)"], ["I", "Indication I (g)"], ["dL", "ΔL (g)"], ["I1", "I1 (g)"], ["I2", "I2 (g)"], ["I_without", "I without (g)"], ["I_with", "I with (g)"],
  ["printed", "Printed (g)"], ["displacement_mm", "Displ. (mm)"], ["extra_g", "Extra load (g)"],
  ["E", "E (g)"], ["E0", "E0 (g)"], ["EL", "EL (g)"], ["Ec", "Ec (g)"], ["Ec_before", "Ec before"], ["Ec_after", "Ec after"], ["durability", "Durability (g)"],
  ["P", "P (g)"], ["dP", "ΔP (g)"], ["change", "Change (g)"], ["changePerStep", "Change / step (g)"], ["diff", "EL−E0 (g)"], ["fault", "Fault (g)"],
  ["n", "n"], ["spread", "Emax−Emin (g)"], ["deviation", "Deviation (g)"], ["required", "Required"], ["required_mm", "Required (mm)"],
  ["mpe", "mpe (g)"], ["limit", "Limit (g)"], ["U", "U (k=2)"], ["value", "Answer"],
];

/** Readings as entered: shown as typed (only binary float noise removed). */
const RAW = new Set(["L", "I", "dL", "I1", "I2", "I_without", "I_with", "printed", "tare_g", "extra_g", "displacement_mm", "t_min", "T_C", "RH_pct", "n", "series", "range_g"]);

/**
 * Display value of a computed quantity. Display only: the stored results keep full precision.
 * U is quoted to 2 significant figures (GUM 7.2.6); other computed masses to e/100, so 2.666666667 g reads 2.7 g when e = 20 g.
 */
export function fmtCell(v: unknown, key: string, e?: number): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return v === null || v === undefined ? "" : String(v);
  if (RAW.has(key)) return String(+v.toPrecision(10));
  if (key === "U") return String(+v.toPrecision(2));
  if (key === "pct" || key === "limit_pct") return String(+v.toFixed(2));
  const dp = e && e > 0 ? Math.max(0, Math.ceil(-Math.log10(e / 100) - 1e-9)) : 6;
  return String(+v.toFixed(dp));
}

/** Sub-table captions for tests whose rows are of different kinds. */
const KIND_CAPTION: Record<string, string> = {
  print: "Printing / storing of the indication", zero_tare: "Zero-setting and tare after disturbance", tare_setting: "Tare-setting accuracy",
  initial_range: "Initial zero-setting range", overall_range: "Zero-setting range", accuracy: "Zero-setting accuracy",
  noLoad: "At no load (change of zero indication)", loaded: "With load", weighing: "Weighing with tare",
};

const hasVal = (x: any, k: string) => x[k] !== undefined && x[k] !== null && typeof x[k] !== "object";

/**
 * Splits a test's rows into tables of one kind each, so a column is shown only where it applies
 * (a single table over mixed rows filled most cells with dashes). Row order is kept within each table.
 */
export function tableGroups(rows: any[], cols: Array<[string, string]>): Array<{ caption?: string; cols: Array<[string, string]>; rows: any[] }> {
  const shape = (x: any) => cols.filter(([k]) => hasVal(x, k)).map(([k]) => k).join(",");
  const byKind = rows.some((x) => x.kind);
  // Tilting-style tests: no-load rows and loaded rows carry different quantities.
  const loadedShapes = new Set(rows.filter((x) => x.L > 0).map(shape));
  const byLoad = !byKind && loadedShapes.size > 0 && rows.some((x) => x.L === 0 && !loadedShapes.has(shape(x)));
  const key = (x: any) => (byKind ? x.kind ?? "weighing" : byLoad ? (x.L === 0 ? "noLoad" : "loaded") : "");
  const order: string[] = [];
  const groups = new Map<string, any[]>();
  for (const x of rows) {
    const k = key(x);
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k)!.push(x);
  }
  return order.map((k) => {
    const g = groups.get(k)!;
    const gc = cols.filter(([c]) => !(byKind && c === "kind") && g.some((x) => hasVal(x, c)));
    return { caption: order.length > 1 ? KIND_CAPTION[k] ?? k : undefined, cols: gc, rows: g };
  });
}

/** Number of trailing columns a reference row has no value for (e.g. the 20 °C row of T02); 0 for other rows. */
export function refSpan(x: any, cols: Array<[string, string]>): number {
  if (x.verdict === "NOT_TESTED") return 0;
  let n = 0;
  while (n < cols.length && !hasVal(x, cols[cols.length - 1 - n][0])) n++;
  return n < cols.length ? n : 0;
}

function testTable(r: any, e?: number): string {
  const rows: any[] = r.rows ?? [];
  if (!rows.length) return `<p class="muted">${esc((r.notes ?? []).join(" ") || "No data.")}</p>`;
  const tables = tableGroups(rows, COLS).map(({ caption, cols, rows: g }) => {
    const head = cols.map(([, h]) => `<th>${esc(h)}</th>`).join("") + "<th>Result</th>";
    const body = g.map((x) => {
      const ref = refSpan(x, cols);
      const cells = cols.slice(0, cols.length - ref).map(([k]) => `<td>${esc(fmtCell(x[k], k, e))}</td>`).join("")
        + (ref ? `<td colspan="${ref}" class="refcell">Reference reading</td>` : "");
      return `<tr class="${x.verdict === "FAIL" ? "r-fail" : x.verdict === "CONDITIONAL" ? "r-cond" : ""}">${cells}<td>${badge(x.verdict)}</td></tr>`;
    }).join("");
    return `${caption ? `<p class="subcap">${esc(caption)}</p>` : ""}<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }).join("");
  const notes = (r.notes ?? []).length ? `<p class="notes">${(r.notes as string[]).map(esc).join("<br/>")}</p>` : "";
  return `${tables}${notes}`;
}

/** Smallest verification interval of the instrument, used to round computed values for display. */
export const displayE = (i: any): number | undefined => {
  const es = [i?.e_g, ...(i?.ranges ?? []).map((r: any) => r.e_g)].filter((x) => typeof x === "number" && x > 0);
  return es.length ? Math.min(...es) : undefined;
};

export function reportHtml(d: ReportData): string {
  const { c, lab, pack, validation } = d;
  const i = c.instrument ?? {};
  const clsDisplay = validation?.classDisplay ?? i.cls;
  const results: any[] = c.results ?? [];
  const tested = results.filter((r) => r.verdict !== "NOT_APPLICABLE");
  const conclusion = c.verdict === "PASS"
    ? "The instrument complies with the requirements evaluated in this report."
    : c.verdict === "CONDITIONAL"
      ? "The measured errors are within the maximum permissible errors, but for the rows marked CONDITIONAL the expanded measurement uncertainty extends beyond the limit (guarded decision rule)."
      : "The instrument does not comply with one or more of the requirements evaluated in this report.";
  const conclusionHi = c.verdict === "PASS" ? "उपकरण इस रिपोर्ट में मूल्यांकित आवश्यकताओं का अनुपालन करता है।" : c.verdict === "CONDITIONAL" ? "त्रुटियाँ अनुमेय सीमा में हैं, किंतु कुछ पंक्तियों में मापन अनिश्चितता सीमा से बाहर जाती है।" : "उपकरण एक या अधिक आवश्यकताओं का अनुपालन नहीं करता है।";
  const photos = d.attachments.filter((a) => a.dataUrl);
  const t17 = results.find((r) => r.testId === "T17");
  const eDisp = displayE(i);

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(d.reportNo)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm 22mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans", "Nirmala UI", "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #0f172a; margin: 0; }
  h1 { font-size: 16pt; margin: 0; color: #034597; }
  h2 { font-size: 11.5pt; color: #034597; border-bottom: 2px solid #034597; padding-bottom: 3px; margin: 18px 0 8px; page-break-after: avoid; }
  h3 { font-size: 10pt; margin: 14px 0 6px; page-break-after: avoid; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #FF904D; padding-bottom: 10px; }
  .lab { font-weight: 700; font-size: 11pt; } .lab small { display: block; font-weight: 400; color: #475569; font-size: 8.5pt; }
  .qr { text-align: center; font-size: 7pt; color: #475569; } .qr img { width: 92px; height: 92px; }
  .title { text-align: center; margin: 12px 0 6px; } .title .hi { color: #475569; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; }
  table.kv td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; } table.kv td:first-child { width: 38%; background: #f1f5f9; font-weight: 600; }
  table.data { font-size: 8.3pt; page-break-inside: auto; } table.data th, table.data td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: right; }
  table.data th { background: #034597; color: #fff; font-weight: 600; text-align: center; } table.data td:first-child { text-align: left; }
  table.data tr { page-break-inside: avoid; }
  tr.r-fail td { background: #fee2e2; } tr.r-cond td { background: #fef3c7; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 7.5pt; font-weight: 700; }
  .b-PASS { background: #dcfce7; color: #166534; } .b-FAIL { background: #fee2e2; color: #991b1b; } .b-CONDITIONAL { background: #fef3c7; color: #92400e; }
  .b-NOT_APPLICABLE, .b-NOT_TESTED { background: #e2e8f0; color: #475569; }
  .refcell { text-align: center !important; color: #64748b; font-style: italic; }
  .subcap { margin: 6px 0 3px; font-size: 8.5pt; font-weight: 600; color: #334155; }
  .muted { color: #64748b; } .notes { color: #475569; font-size: 8pt; margin: 4px 0 0; }
  .verdict { margin: 10px 0; padding: 10px 12px; border-radius: 6px; border: 2px solid; font-size: 10.5pt; }
  .v-PASS { border-color: #16a34a; background: #f0fdf4; } .v-FAIL { border-color: #dc2626; background: #fef2f2; } .v-CONDITIONAL { border-color: #d97706; background: #fffbeb; }
  .sig-block { break-inside: avoid; page-break-inside: avoid; }
  .sig { display: flex; gap: 12px; margin-top: 10px; }
  .verify-line { margin: 10px 0 0; font-size: 8.5pt; color: #334155; } .sig > div { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; min-height: 70px; }
  .sig b { display: block; font-size: 8pt; color: #475569; font-weight: 600; } .sig .name { font-weight: 700; margin-top: 18px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; } .photos figure { margin: 0; width: 31%; } .photos img { width: 100%; height: 120px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 4px; }
  .photos figcaption { font-size: 7.5pt; color: #475569; }
  .chart { margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .test { page-break-inside: auto; } .mono { font-family: Consolas, monospace; font-size: 7.5pt; word-break: break-all; }
</style></head><body>
<div class="head">
  <div class="lab">${esc(lab?.name ?? "Regional Reference Standards Laboratory")}${lab?.nameHi ? `<small>${esc(lab.nameHi)}</small>` : ""}<small>${esc(lab?.address ?? "")}</small>${lab?.accreditationNo ? `<small>Accreditation: ${esc(lab.accreditationNo)}</small>` : ""}</div>
  <div class="qr"><img src="${d.qrDataUrl}" alt="QR"/><div>${esc(L.verify[0])}<br/>${esc(L.verify[1])}</div></div>
</div>
<div class="title"><h1>${esc(L.title[0])}</h1><div class="hi">${esc(L.title[1])}</div><div>${esc(L.subtitle[0])} · ${esc(L.subtitle[1])}</div></div>
<table class="kv">
  <tr><td>${bi("reportNo")}</td><td><b>${esc(d.reportNo)}</b></td></tr>
  ${d.revisionOf ? `<tr><td>Revision</td><td><b>Revision ${esc(d.revisionOf.revision)}</b>: supersedes report ${esc(d.revisionOf.reportNo)}, which is no longer valid.${d.revisionOf.reason ? `<br/><span class="muted">Reason: ${esc(d.revisionOf.reason)}</span>` : ""}</td></tr>` : ""}
  <tr><td>${bi("caseNo")}</td><td>${esc(c.caseNo)}</td></tr>
  <tr><td>${bi("applicationNo")}</td><td>${esc(c.applicationNo ?? "—")}</td></tr>
  <tr><td>${bi("date")}</td><td>${esc(fmtDate(d.signedAt))}</td></tr>
</table>

<h2>1. ${bi("general")}</h2>
<table class="kv">
  <tr><td>${bi("manufacturer")}</td><td>${esc(c.manufacturer?.name)}<br/><span class="muted">${esc(c.manufacturer?.address)}</span></td></tr>
  <tr><td>${bi("applicant")}</td><td>${esc(c.applicant?.name ?? c.manufacturer?.name)}</td></tr>
  <tr><td>${bi("type")}</td><td>${esc(i.type)}</td></tr>
  <tr><td>${bi("model")}</td><td>${esc(i.model)}</td></tr>
  <tr><td>${bi("serial")}</td><td>${esc(i.serialNo ?? "—")}</td></tr>
  <tr><td>${bi("software")}</td><td>${esc(i.softwareVersion ?? "—")}</td></tr>
</table>
<h3>${bi("metrology")}</h3>
<table class="kv">
  <tr><td>${bi("cls")}</td><td><b>${esc(clsDisplay)}</b></td></tr>
  <tr><td>${bi("max")}</td><td>${fmtMass(i.max_g)}</td></tr>
  <tr><td>${bi("min")}</td><td>${fmtMass(i.min_g)}</td></tr>
  <tr><td>${bi("e")}</td><td>${fmtMass(i.e_g)}</td></tr>
  <tr><td>${bi("d")}</td><td>${fmtMass(i.d_g)}</td></tr>
  <tr><td>${bi("n")}</td><td>${num(validation?.n)}</td></tr>
  ${i.ranges?.length ? `<tr><td>${bi("ranges")}</td><td>${i.ranges.map((r: any, k: number) => `Max${k + 1} = ${fmtMass(r.max_g)}, e${k + 1} = ${fmtMass(r.e_g)}`).join("<br/>")}</td></tr>` : ""}
  <tr><td>${bi("indication")}</td><td>${esc(i.indication)}${i.electronic ? " · electronic" : ""}</td></tr>
  <tr><td>${bi("power")}</td><td>${esc(i.power)}${i.Unom_V ? ` · Unom ${esc(i.Unom_V)} V` : ""}</td></tr>
  <tr><td>${bi("temp")}</td><td>${i.tempLow_C ?? -10} °C / +${i.tempHigh_C ?? 40} °C</td></tr>
</table>

<h2>2. ${bi("basis")}</h2>
<table class="kv">
  <tr><td>${bi("rulepack")}</td><td>${esc(pack.title)}<br/><span class="muted">Version ${esc(pack.version)}</span></td></tr>
  <tr><td>${bi("decision")}</td><td>${esc(c.decisionRule === "guarded" ? pack.verdict_policy.rules.guarded : pack.verdict_policy.rules.simple)}</td></tr>
  <tr><td>Error formula</td><td>${esc(pack.error_formula.error)}; ${esc(pack.error_formula.corrected_error)} (${esc(pack.error_formula.clause)})</td></tr>
</table>
${pack.differences_from_base?.length ? `<h3>Differences from ${esc(pack.extends === "OIML_R76" ? "OIML R 76-1:2006" : pack.extends ?? "the base standard")}</h3>
<p class="muted">This evaluation follows the standard above. Where it differs from the base standard, the following requirements were applied:</p>
<table class="data"><thead><tr><th>Topic</th><th>Base standard</th><th>Applied here</th><th>Clause</th></tr></thead><tbody>${pack.differences_from_base.map((x: Record<string, string>) => `<tr><td>${esc(x.topic)}</td><td>${esc(x.base)}</td><td>${esc(x.profile)}</td><td>${esc(x.clause)}</td></tr>`).join("")}</tbody></table>` : ""}
<h3>${bi("environment")}</h3>
${d.sessions.length ? `<table class="data"><thead><tr><th>Date</th><th>Test</th><th>T (°C)</th><th>RH (%)</th><th>p (hPa)</th><th>Notes</th></tr></thead><tbody>${d.sessions.map((s) => `<tr><td>${esc(fmtDateTime(s.date))}</td><td>${esc(s.testId ?? "all")}</td><td>${num(s.T_C)}</td><td>${num(s.RH_pct)}</td><td>${num(s.p_hPa)}</td><td>${esc(s.notes ?? "")}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">—</p>`}
<h3>${bi("standards")}</h3>
<table class="data"><thead><tr><th>Item</th><th>Class / kind</th><th>Nominal</th><th>Certificate</th><th>Cal. due</th></tr></thead><tbody>
${[...d.weights.map((w) => `<tr><td>${esc(w.code)}</td><td>${esc(w.class)}</td><td>${fmtMass(w.nominal_g)}</td><td>${esc(w.certificate ?? "")}</td><td>${esc(w.cal_due)}</td></tr>`),
   ...d.equipment.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.kind)}</td><td></td><td>${esc(e.certificate ?? "")}</td><td>${esc(e.cal_due)}</td></tr>`)].join("") || `<tr><td colspan="5">—</td></tr>`}
</tbody></table>

<h2>3. ${bi("summary")}</h2>
<table class="data"><thead><tr><th>#</th><th>${bi("test")}</th><th>${bi("clause")}</th><th>${bi("result")}</th></tr></thead><tbody>
${results.map((r) => `<tr><td>${esc(r.testId)}</td><td style="text-align:left">${esc(r.name)}</td><td style="text-align:left">${esc(r.clause)}</td><td style="text-align:center">${badge(r.verdict)}</td></tr>`).join("")}
</tbody></table>

<h2>4. ${bi("results")}</h2>
${tested.filter((r) => r.testId !== "T17").map((r) => `<div class="test"><h3>${esc(r.testId)} · ${esc(r.name)} <span class="muted">(${esc(r.clause)})</span> ${badge(r.verdict)}</h3>${testTable(r, eDisp)}${r.testId === "T01" ? `<div class="chart">${errorChartSvg(toProfile(c), pack, r.rows ?? [])}</div>` : ""}</div>`).join("")}

<h2>5. ${bi("construction")}</h2>
${t17 ? testTable(t17, eDisp) : `<p class="muted">—</p>`}
${photos.length ? `<div class="photos">${photos.map((p) => `<figure><img src="${p.dataUrl}"/><figcaption>${esc(p.caption || p.filename)}</figcaption></figure>`).join("")}</div>` : ""}

<h2>6. ${bi("conclusion")}</h2>
<div class="verdict v-${esc(c.verdict)}"><b>${esc(L[c.verdict as keyof typeof L]?.[0] ?? c.verdict)} / ${esc(L[c.verdict as keyof typeof L]?.[1] ?? "")}</b><br/>${esc(conclusion)}<br/><span class="muted">${esc(conclusionHi)}</span></div>

<div class="sig-block">
<h3>${bi("signatures")}</h3>
<div class="sig">
  <div><b>${bi("testedBy")}</b><div class="name">${esc(d.people.engineer?.name ?? "")}</div><div class="muted">${esc(d.people.engineer?.designation ?? "")}</div></div>
  ${d.people.reviewer ? `<div><b>${bi("reviewedBy")}</b><div class="name">${esc(d.people.reviewer.name)}</div><div class="muted">${esc(d.people.reviewer.designation ?? "")}</div></div>` : ""}
  <div><b>${bi("approvedBy")}</b><div class="name">${esc(d.people.approver?.name ?? "")}</div><div class="muted">${esc(d.people.approver?.designation ?? "")}</div><div class="muted">Digitally signed ${esc(fmtDateTime(d.signedAt))}</div></div>
</div>
</div>

<h3>${bi("annexures")}</h3>
<table class="data"><thead><tr><th>#</th><th>Category</th><th>Description</th></tr></thead><tbody>
${d.attachments.map((a, k) => `<tr><td>${k + 1}</td><td style="text-align:left">${esc(CATEGORY[a.category] ?? a.category)}</td><td style="text-align:left">${esc(a.caption || a.filename)}</td></tr>`).join("") || `<tr><td colspan="3">—</td></tr>`}
</tbody></table>
<p class="muted" style="margin-top:12px">The results relate only to the instrument tested. This report shall not be reproduced except in full without the written approval of the laboratory.</p>
</body></html>`;
}

export function footerHtml(reportNo: string): string {
  return `<div style="font-size:7px;width:100%;padding:0 14mm;color:#475569;display:flex;justify-content:space-between;font-family:Arial">
  <span>Report No. ${esc(reportNo)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}
