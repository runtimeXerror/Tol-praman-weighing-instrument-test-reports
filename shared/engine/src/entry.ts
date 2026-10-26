import { eAt, rangesOf } from "./instrument";
import { gt, isNum } from "./num";
import type { InstrumentProfile } from "./types";

/**
 * Entry checks for typed readings. They only warn: a value the check does not expect may still be what the
 * instrument showed, so it is never changed or rejected, and verdicts are not affected.
 */
export interface EntryWarning {
  code: "OFF_STEP" | "DL_RANGE";
  message: string;
  clause: string;
}

/** x is a whole multiple of step (within float noise). */
function onStep(x: number, step: number): boolean {
  const q = x / step;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

/**
 * A digital indication is always a whole number of actual scale intervals d (R76-1 T.3.2.2).
 * On multiple-range / multi-interval instruments a multiple of e_i of the range holding the value is also accepted.
 */
export function indicationWarning(inst: InstrumentProfile, value: unknown): EntryWarning | null {
  if (!isNum(value) || !(inst.d_g > 0)) return null;
  if (onStep(value, inst.d_g)) return null;
  if (rangesOf(inst).length > 1 && onStep(value, eAt(inst, value))) return null;
  return {
    code: "OFF_STEP",
    message: `${value} g is not a multiple of d = ${inst.d_g} g, so the instrument cannot show it. Check for a typing slip.`,
    clause: "R76-1 T.3.2.2",
  };
}

/**
 * Change-point weights: 1/10 e steps are added until the indication rises by one interval (R76-1 A.4.4.3),
 * so the added load lies between 0 and e. e is taken at the load L when it is known, else the largest e.
 */
export function changePointWarning(inst: InstrumentProfile, dL: unknown, L?: unknown): EntryWarning | null {
  if (!isNum(dL)) return null;
  const e = isNum(L) ? eAt(inst, L) : Math.max(...rangesOf(inst).map((r) => r.e_g));
  if (dL >= 0 && !gt(dL, e)) return null;
  return {
    code: "DL_RANGE",
    message: `ΔL = ${dL} g is outside 0 to e = ${e} g: added weights stop once the indication rises by one interval.`,
    clause: "R76-1 A.4.4.3",
  };
}
