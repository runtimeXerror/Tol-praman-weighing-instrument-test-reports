import { classDef, normalizeClass, rangeIndexFor, rangesOf } from "./instrument";
import { clean, lte } from "./num";
import type { InstrumentProfile, RulePack } from "./types";

export interface MpeResult {
  /** Absolute value of the maximum permissible error, grams. */
  mpe_g: number;
  /** mpe in multiples of the e used (0.5, 1.0, 1.5; doubled in service). */
  mpe_e: number;
  e_g: number;
  /** Load in verification scale intervals, m = L / e_i. */
  m: number;
  rangeIndex: number;
  inService: boolean;
  clause: string;
}

/**
 * Maximum permissible error for a load (R76-1 3.5.1 Table 6 / Hdg A Table 20).
 * Multi-interval: m = L / e_i of the partial range containing L (R76-1 3.3 example).
 * In service (inspection): multiplied by the pack's in-service multiplier (3.5.2 / 3(6)(ii)).
 */
export function mpe(inst: InstrumentProfile, load_g: number, pack: RulePack, opts: { inService?: boolean } = {}): MpeResult {
  const cls = normalizeClass(String(inst.cls), pack);
  const def = classDef(cls, pack);
  const idx = rangeIndexFor(inst, load_g);
  let e = rangesOf(inst)[idx].e_g;
  if (def.e_floor_g && e < def.e_floor_g) e = def.e_floor_g;
  const m = clean(Math.abs(load_g) / e);
  const bands = pack.mpe_initial_verification.bands[cls];
  let band = bands[bands.length - 1];
  for (const b of bands) {
    if (b.m_max_e === null || lte(m, b.m_max_e)) {
      band = b;
      break;
    }
  }
  const inService = !!opts.inService;
  const mult = inService ? pack.mpe_in_service_multiplier.value : 1;
  const mpe_e = band.mpe_e * mult;
  return {
    mpe_g: clean(mpe_e * e),
    mpe_e,
    e_g: e,
    m,
    rangeIndex: idx,
    inService,
    clause: inService ? `${pack.mpe_initial_verification.clause}; ${pack.mpe_in_service_multiplier.clause}` : pack.mpe_initial_verification.clause,
  };
}

/** Loads (grams) at which the mpe changes, for choosing test loads (R76-1 A.4.4.1). */
export function mpeChangePoints(inst: InstrumentProfile, pack: RulePack): number[] {
  const cls = normalizeClass(String(inst.cls), pack);
  const rs = rangesOf(inst);
  const pts = new Set<number>();
  rs.forEach((r, i) => {
    const lower = i === 0 ? 0 : rs[i - 1].max_g;
    for (const b of pack.mpe_initial_verification.bands[cls]) {
      if (b.m_max_e === null) continue;
      const L = clean(b.m_max_e * r.e_g);
      if (L > lower && L < r.max_g) pts.add(L);
    }
    if (i < rs.length - 1) pts.add(r.max_g);
  });
  return [...pts].sort((a, b) => a - b);
}

export interface EnvelopeStep {
  /** Segment (from_g, to_g]; the first segment starts at 0 inclusive. */
  from_g: number;
  to_g: number;
  mpe_g: number;
  e_g: number;
}

/**
 * The ±mpe envelope over 0..Max as steps, for the error-vs-load chart. Each step's value is the
 * same mpe() used for verdicts, taken at the step's upper end (band edges belong to the lower band).
 */
export function mpeEnvelope(inst: InstrumentProfile, pack: RulePack, opts: { inService?: boolean } = {}): EnvelopeStep[] {
  const max = rangesOf(inst).at(-1)!.max_g;
  const pts = [0, ...mpeChangePoints(inst, pack).filter((p) => p < max), max];
  const steps: EnvelopeStep[] = [];
  for (let i = 1; i < pts.length; i++) {
    const m = mpe(inst, pts[i], pack, opts);
    steps.push({ from_g: pts[i - 1], to_g: pts[i], mpe_g: m.mpe_g, e_g: m.e_g });
  }
  return steps;
}
