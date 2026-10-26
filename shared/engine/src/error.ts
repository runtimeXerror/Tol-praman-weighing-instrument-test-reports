import { eAt } from "./instrument";
import { lim } from "./limits";
import { clean, isNum } from "./num";
import type { InstrumentProfile, RulePack } from "./types";

export type ErrorMethod = "changeover" | "direct";

/**
 * How to determine the indication prior to rounding.
 * R76-1 3.5.3.2 / A.4.1.6: the rounding error shall be eliminated (changeover points, A.4.4.3)
 * when d > 0.2 e. When the instrument shows a scale interval <= e/5 (d <= 0.2 e),
 * the indication may be used directly.
 */
export function errorMethod(inst: InstrumentProfile, pack: RulePack, load_g = 0): ErrorMethod {
  const ratio = lim<{ d_over_e_gt: number }>(pack, "rounding_error_elimination").d_over_e_gt;
  return inst.d_g > ratio * eAt(inst, load_g) + 1e-15 ? "changeover" : "direct";
}

/** Indication prior to rounding, P = I + 0.5 e - dL (R76-1 A.4.4.3). */
export function indicationPriorToRounding(I: number, dL: number, e: number): number {
  return clean(I + 0.5 * e - dL);
}

/** E = I + 0.5 e - dL - L (changeover), or E = I - L (direct). */
export function errorOf(I: number, dL: number | undefined | null, L: number, e: number, method: ErrorMethod = "changeover"): number {
  if (method === "direct" || !isNum(dL)) return clean(I - L);
  return clean(I + 0.5 * e - dL - L);
}

/** Ec = E - E0 (R76-1 A.4.4.3). */
export function correctedError(E: number, E0: number): number {
  return clean(E - E0);
}

export interface Reading {
  L: number;
  I: number;
  dL?: number | null;
}

/**
 * Error of a reading using the e of the range where the indication (I + e) appears
 * (A.4.4.3 note for multi-interval instruments).
 */
export function readingError(inst: InstrumentProfile, pack: RulePack, r: Reading): number {
  const method = r.dL === undefined || r.dL === null ? "direct" : errorMethod(inst, pack, r.I);
  return errorOf(r.I, r.dL, r.L, eAt(inst, r.I), method);
}
