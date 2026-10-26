import { applicableTests } from "./applicability";
import { ctx, notApplicable } from "./tests/common";
import { t04Discrimination, t05Sensitivity, t06Repeatability, t08Stability, t09Tilting, t13Disturbances, t17Checklist, t18ZeroSetting } from "./tests/functional";
import { t02TempNoLoad, t07aZeroReturn, t07bCreep, t11WarmUp, t15SpanStability } from "./tests/time";
import { t01Weighing, t03Eccentricity, t10Tare, t12Power, t14DampHeat, t16Endurance, t19StaticTemperatures } from "./tests/weighing";
import { aggregate } from "./verdict";
import type { Ctx, EvalOptions, InstrumentProfile, RulePack, TestResult, Verdict } from "./types";

type Kernel = (c: Ctx, input: any) => TestResult;

export const KERNELS: Record<string, Kernel> = {
  T01: t01Weighing,
  T02: t02TempNoLoad,
  T03: t03Eccentricity,
  T04: t04Discrimination,
  T05: t05Sensitivity,
  T06: t06Repeatability,
  T07a: t07aZeroReturn,
  T07b: t07bCreep,
  T08: t08Stability,
  T09: t09Tilting,
  T10: t10Tare,
  T11: t11WarmUp,
  T12: t12Power,
  T13: t13Disturbances,
  T14: t14DampHeat,
  T15: t15SpanStability,
  T16: t16Endurance,
  T17: t17Checklist,
  T18: t18ZeroSetting,
  T19: t19StaticTemperatures,
};

/** Evaluate one test. Returns NOT_APPLICABLE with the reason when the pack says the test does not apply. */
export function evaluateTest(testId: string, inst: InstrumentProfile, pack: RulePack, input: unknown, opts: EvalOptions = {}): TestResult {
  const c = ctx(inst, pack, opts);
  const app = applicableTests(inst, pack).find((t) => t.id === testId);
  if (!app) throw new Error(`Unknown test ${testId}`);
  if (!app.applicable) return notApplicable(c, testId, `Not applicable: ${app.reasons.join("; ")}.`);
  const k = KERNELS[testId];
  if (!k) throw new Error(`No kernel for ${testId}`);
  if (input == null) return { ...notApplicable(c, testId, "No data entered."), verdict: "NOT_TESTED" };
  return k(c, input);
}

export interface CaseEvaluation {
  results: TestResult[];
  verdict: Verdict;
  counts: Record<Verdict, number>;
}

/** Evaluate every test in the pack. Missing inputs for an applicable test give NOT_TESTED. */
export function evaluateCase(inst: InstrumentProfile, pack: RulePack, inputs: Record<string, unknown>, opts: EvalOptions = {}): CaseEvaluation {
  const results = pack.tests.map((t) => evaluateTest(t.id, inst, pack, inputs[t.id] ?? null, opts));
  const counts = { PASS: 0, CONDITIONAL: 0, FAIL: 0, NOT_APPLICABLE: 0, NOT_TESTED: 0 } as Record<Verdict, number>;
  for (const r of results) counts[r.verdict]++;
  return { results, verdict: aggregate(results.map((r) => r.verdict)), counts };
}
