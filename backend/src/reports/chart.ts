import { mpeEnvelope, rangesOf, type InstrumentProfile, type RulePack } from "@tolpraman/engine";

/** Same colours and shapes as the web chart: increasing = blue circle, decreasing = orange triangle. */
const UP = "#3f76cf";
const DOWN = "#d95a0c";
const n = (v: number) => String(+v.toPrecision(6));
/** Smallest 1 / 2 / 2.5 / 5 x 10^k at or above x (same as the web chart). */
const niceTop = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(x));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= x - 1e-12) ?? 10) * p;
};

/** T01 error-vs-load chart for the PDF: each Ec against the ±mpe envelope from the case's rule pack. */
export function errorChartSvg(inst: InstrumentProfile, pack: RulePack, rows: any[]): string {
  const pts = rows.filter((r) => typeof r.Ec === "number" && typeof r.L === "number");
  if (!pts.length) return "";
  let steps;
  try { steps = mpeEnvelope(inst, pack); } catch { return ""; }
  const max = rangesOf(inst).at(-1)!.max_g;
  const unit = max >= 1e6 ? { f: 1e6, s: "t" } : max >= 1000 ? { f: 1000, s: "kg" } : { f: 1, s: "g" };
  const W = 640, H = 220, l = 58, r = 12, t = 12, b = 34;
  const top = niceTop(Math.max(...steps.map((s) => s.mpe_g), ...pts.map((p) => Math.abs(p.Ec))) * 1.1);
  const x = (L: number) => l + (L / max) * (W - l - r);
  const y = (E: number) => t + ((top - E) / (2 * top)) * (H - t - b);

  // stepped band: upper edge left-to-right, lower edge right-to-left
  const upper = steps.flatMap((s) => [`${x(s.from_g)},${y(s.mpe_g)}`, `${x(s.to_g)},${y(s.mpe_g)}`]);
  const lower = [...steps].reverse().flatMap((s) => [`${x(s.to_g)},${y(-s.mpe_g)}`, `${x(s.from_g)},${y(-s.mpe_g)}`]);
  const edge = (sign: 1 | -1) => steps.map((s, k) => `${k ? "L" : "M"}${x(s.from_g)},${y(sign * s.mpe_g)} L${x(s.to_g)},${y(sign * s.mpe_g)}`).join(" ");

  const yTicks = [-top, -top / 2, 0, top / 2, top];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const marks = pts.map((p) => {
    const cx = x(p.L), cy = y(p.Ec);
    return p.dir === "down"
      ? `<path d="M${cx},${cy - 5} L${cx + 5},${cy + 3.6} L${cx - 5},${cy + 3.6} Z" fill="${DOWN}" stroke="#fff" stroke-width="1.5"/>`
      : `<circle cx="${cx}" cy="${cy}" r="4" fill="${UP}" stroke="#fff" stroke-width="1.5"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;font-family:Arial;font-size:9px">
  ${yTicks.map((v) => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0"/><text x="${l - 6}" y="${y(v) + 3}" text-anchor="end" fill="#64748b">${n(v)}</text>`).join("")}
  ${xTicks.map((v) => `<text x="${x(v)}" y="${H - b + 14}" text-anchor="middle" fill="#64748b">${n(v / unit.f)}</text>`).join("")}
  <polygon points="${[...upper, ...lower].join(" ")}" fill="#94a3b8" fill-opacity="0.18"/>
  <path d="${edge(1)}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 3"/>
  <path d="${edge(-1)}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 3"/>
  <line x1="${l}" x2="${W - r}" y1="${y(0)}" y2="${y(0)}" stroke="#64748b" stroke-width="0.8"/>
  ${marks}
  <text x="${W - r}" y="${H - 4}" text-anchor="end" fill="#475569">Load (${unit.s})</text>
  <text transform="translate(12 ${t + (H - t - b) / 2}) rotate(-90)" text-anchor="middle" fill="#475569">Ec (g)</text>
</svg>
<p class="notes"><svg width="9" height="9"><circle cx="4.5" cy="4.5" r="4" fill="${UP}"/></svg> Increasing load &nbsp; <svg width="10" height="9"><path d="M5,0 L10,9 L0,9 Z" fill="${DOWN}"/></svg> Decreasing load &nbsp; <span style="display:inline-block;width:14px;height:8px;background:#e2e8f0;border:1px dashed #94a3b8"></span> ±MPE limit</p>`;
}
