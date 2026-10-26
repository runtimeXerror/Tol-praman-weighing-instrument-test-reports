import { readingError, type Reading } from "../error";
import { testDef } from "../limits";
import { mpe } from "../mpe";
import { clean, isNum } from "../num";
import { aggregate, decide } from "../verdict";
import type { Ctx, EvalOptions, InstrumentProfile, Row, RulePack, TestResult, Verdict } from "../types";

export function ctx(inst: InstrumentProfile, pack: RulePack, opts: EvalOptions = {}): Ctx {
  return { inst, pack, opts };
}

export function complete(r: Partial<Reading> | undefined): r is Reading {
  return !!r && isNum(r.L) && isNum(r.I);
}

/** Error at zero (E0) from a no-load reading; 0 when not supplied. */
export function zeroError(c: Ctx, z?: Partial<Reading> | null): number {
  if (!z || !isNum(z.I)) return 0;
  return readingError(c.inst, c.pack, { L: isNum(z.L) ? z.L : 0, I: z.I, dL: z.dL ?? null });
}

/** Standard weighing row: E, Ec = E - E0, mpe, U, verdict. */
export function weighRow(c: Ctx, r: Partial<Reading> & Record<string, unknown>, E0: number): Row {
  if (!complete(r)) return { ...r, verdict: "NOT_TESTED" };
  const E = readingError(c.inst, c.pack, r);
  const Ec = clean(E - E0);
  const m = mpe(c.inst, r.L, c.pack, { inService: c.opts.inService });
  const U = c.opts.uncertainty ? clean(c.opts.uncertainty(r.L)) : null;
  return {
    ...r,
    E,
    E0,
    Ec,
    mpe: m.mpe_g,
    e: m.e_g,
    U,
    verdict: decide(Ec, m.mpe_g, U ?? 0, c.opts.rule ?? "simple"),
    clause: m.clause,
  };
}

export function result(c: Ctx, testId: string, rows: Row[], notes: string[] = [], extra: Partial<TestResult> = {}, forced?: Verdict): TestResult {
  const def = testDef(c.pack, testId);
  return {
    testId,
    name: def.name,
    clause: def.clause,
    rows,
    verdict: forced ?? aggregate(rows.map((r) => r.verdict)),
    notes,
    ...extra,
  };
}

export function notApplicable(c: Ctx, testId: string, reason: string): TestResult {
  return result(c, testId, [], [reason], {}, "NOT_APPLICABLE");
}
