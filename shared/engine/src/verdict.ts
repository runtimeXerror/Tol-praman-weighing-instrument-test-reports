import { lte } from "./num";
import type { DecisionRule, Verdict } from "./types";

/**
 * Decision rule on one error value.
 * simple : PASS if |Ec| <= mpe, else FAIL (OIML default; U reported for information).
 * guarded: PASS if |Ec| + U <= mpe; CONDITIONAL if |Ec| <= mpe < |Ec| + U; FAIL if |Ec| > mpe.
 */
export function decide(Ec: number, mpe: number, U = 0, rule: DecisionRule = "simple"): Verdict {
  const a = Math.abs(Ec);
  const m = Math.abs(mpe);
  if (!lte(a, m)) return "FAIL";
  if (rule === "guarded" && !lte(a + Math.abs(U), m)) return "CONDITIONAL";
  return "PASS";
}

/** Simple limit check (no uncertainty): |x| <= limit. */
export function within(x: number, limit: number): Verdict {
  return lte(Math.abs(x), Math.abs(limit)) ? "PASS" : "FAIL";
}

const RANK: Record<Verdict, number> = { NOT_APPLICABLE: 0, PASS: 1, CONDITIONAL: 2, NOT_TESTED: 3, FAIL: 4 };

/**
 * Aggregate verdicts: FAIL beats everything, then incomplete (NOT_TESTED), then CONDITIONAL.
 * An empty list is NOT_TESTED. All NOT_APPLICABLE stays NOT_APPLICABLE.
 */
export function aggregate(vs: Verdict[]): Verdict {
  if (vs.length === 0) return "NOT_TESTED";
  return vs.reduce((w, v) => (RANK[v] > RANK[w] ? v : w), "NOT_APPLICABLE" as Verdict);
}
