import { e1, eAt, normalizeClass } from "../instrument";
import { indicationPriorToRounding, readingError, type Reading } from "../error";
import { lim } from "../limits";
import { mpe } from "../mpe";
import { clean, isNum, lte } from "../num";
import { aggregate, within } from "../verdict";
import type { Ctx, Row, TestResult, Verdict } from "../types";
import { complete, result, zeroError } from "./common";

type R = Partial<Reading> & Record<string, unknown>;

/** T02 Temperature effect on no-load indication (3.9.2.3 / A.5.3.2): change per 1 C (class I) or 5 C <= e1. */
export function t02TempNoLoad(c: Ctx, input: { rows: Array<{ T_C?: number; I?: number; dL?: number | null }> }): TestResult {
  const cfg = lim<any>(c.pack, "temperature_no_load");
  const cls = normalizeClass(String(c.inst.cls), c.pack);
  const per = cfg.per_delta_C[cls] as number;
  const e = e1(c.inst);
  const limit = clean(cfg.limit_e * e);
  const pts = input.rows.map((r) => (isNum(r.T_C) && isNum(r.I) ? { ...r, E0: zeroError(c, { L: 0, I: r.I, dL: r.dL }) } : { ...r, E0: null }));
  const rows: Row[] = pts.map((p, i) => {
    if (i === 0) return { ...p, verdict: p.E0 === null ? "NOT_TESTED" : "PASS", note: "reference" };
    const prev = pts[i - 1];
    if (p.E0 === null || prev.E0 === null || !isNum(p.T_C) || !isNum(prev.T_C)) return { ...p, verdict: "NOT_TESTED" };
    const dT = Math.abs(p.T_C - prev.T_C);
    if (dT === 0) return { ...p, verdict: "NOT_TESTED", note: "same temperature as previous" };
    const perStep = clean((Math.abs(p.E0 - prev.E0) / dT) * per);
    return { ...p, dT, changePerStep: perStep, limit, verdict: within(perStep, limit), clause: cfg.clause };
  });
  return result(c, "T02", rows, [`Limit: ${cfg.limit_e} e1 = ${limit} g per ${per} C.`]);
}

/** T07a Return to zero (3.9.4.2): |E0 after 30 min at ~Max - E0 before| <= 0.5 e1; multiple range: 5-min drift <= e1. */
export function t07aZeroReturn(c: Ctx, input: { before?: R; after?: R; after5min?: R }): TestResult {
  const k = lim<{ value: number; clause: string }>(c.pack, "zero_return_e");
  if (!input.before || !input.after || !isNum(input.before.I) || !isNum(input.after.I)) {
    return result(c, "T07a", [{ verdict: "NOT_TESTED" }]);
  }
  const b = zeroError(c, input.before);
  const a = zeroError(c, input.after);
  const limit = clean(k.value * e1(c.inst));
  const d = clean(a - b);
  const rows: Row[] = [{ E0_before: b, E0_after: a, change: d, limit, verdict: within(d, limit), clause: k.clause }];
  if (input.after5min && isNum(input.after5min.I)) {
    const a5 = zeroError(c, input.after5min);
    const d5 = clean(a5 - a);
    rows.push({ E0_after: a, E0_after5: a5, change: d5, limit: e1(c.inst), verdict: within(d5, e1(c.inst)), note: "multiple range, 5 min" });
  }
  return result(c, "T07a", rows);
}

/**
 * T07b Creep (3.9.4.1 / A.4.11.1). Condition a): |P(t) - P0| <= 0.5 e for t <= 30 min and |P30 - P15| <= 0.2 e.
 * Otherwise condition b): |P(t) - P0| <= |mpe| over 4 hours.
 */
export function t07bCreep(c: Ctx, input: { L?: number; rows: Array<{ t_min?: number; I?: number; dL?: number | null }> }): TestResult {
  const cfg = lim<any>(c.pack, "creep");
  const L = input.L ?? NaN;
  const pts = input.rows
    .filter((r) => isNum(r.t_min) && isNum(r.I))
    .map((r) => ({ t: r.t_min as number, P: isNum(r.dL) ? indicationPriorToRounding(r.I as number, r.dL, eAt(c.inst, r.I as number)) : (r.I as number) }))
    .sort((a, b) => a.t - b.t);
  if (!isNum(L) || pts.length < 2 || pts[0].t !== 0) {
    return result(c, "T07b", input.rows.map((r) => ({ ...r, verdict: "NOT_TESTED" as Verdict })), ["Need a reading at 0 min and later readings."]);
  }
  const e = eAt(c.inst, L);
  const P0 = pts[0].P;
  const m = mpe(c.inst, L, c.pack, { inService: c.opts.inService }).mpe_g;
  const rows: Row[] = pts.map((p) => ({ t_min: p.t, P: p.P, dP: clean(p.P - P0), verdict: "PASS" }));
  const within30 = pts.filter((p) => p.t <= cfg.short_minutes);
  const has30 = pts.some((p) => p.t === cfg.short_minutes);
  const p15 = pts.find((p) => p.t === 15);
  const p30 = pts.find((p) => p.t === cfg.short_minutes);
  const aTotal = within30.every((p) => lte(Math.abs(p.P - P0), cfg.short_total_e * e));
  const a1530 = p15 && p30 ? lte(Math.abs(p30.P - p15.P), cfg.short_15_30_e * e) : false;
  const condA = has30 && aTotal && a1530;
  const has4h = pts.some((p) => p.t >= cfg.long_hours * 60);
  const condB = has4h && pts.every((p) => lte(Math.abs(p.P - P0), m));
  let verdict: Verdict;
  const notes: string[] = [];
  if (condA) { verdict = "PASS"; notes.push("Condition a) met (30-minute rule); test may end at 30 min."); }
  else if (condB) { verdict = "PASS"; notes.push("Condition b) met (4-hour rule)."); }
  else if (!has4h && has30 && !condA) { verdict = "NOT_TESTED"; notes.push("Condition a) not met: continue for 4 hours (condition b)."); }
  else if (!has30) { verdict = "NOT_TESTED"; notes.push("Readings up to 30 min required."); }
  else { verdict = "FAIL"; notes.push("Neither condition a) nor b) met."); }
  for (const r of rows) {
    const t = r.t_min as number;
    const dP = Math.abs(r.dP as number);
    r.verdict = t <= cfg.short_minutes ? (lte(dP, cfg.short_total_e * e) ? "PASS" : condB ? "PASS" : "FAIL") : lte(dP, m) ? "PASS" : "FAIL";
  }
  return result(c, "T07b", rows, notes, { summary: { conditionA: condA, conditionB: condB, mpe_g: m } }, verdict);
}

/** T11 Warm-up (A.5.2): at 0, 5, 15, 30 min, |EL - E0| <= |mpe|. */
export function t11WarmUp(c: Ctx, input: { L?: number; rows: Array<{ t_min: number; zero?: R; loaded?: R }> }): TestResult {
  const cfg = lim<any>(c.pack, "warm_up");
  const rows: Row[] = input.rows.map((r) => {
    if (!r.zero || !isNum(r.zero.I) || !complete(r.loaded)) return { t_min: r.t_min, verdict: "NOT_TESTED" };
    const E0 = zeroError(c, r.zero);
    const EL = readingError(c.inst, c.pack, r.loaded);
    const m = mpe(c.inst, r.loaded.L, c.pack, { inService: c.opts.inService }).mpe_g;
    const diff = clean(EL - E0);
    return { t_min: r.t_min, L: r.loaded.L, E0, EL, diff, mpe: m, verdict: within(diff, m), clause: cfg.clause };
  });
  const have = new Set(input.rows.map((r) => r.t_min));
  const missing = (cfg.minutes as number[]).filter((t) => !have.has(t));
  const out = result(c, "T11", rows, missing.length ? [`Missing readings at ${missing.join(", ")} min.`] : []);
  if (missing.length && out.verdict === "PASS") out.verdict = "NOT_TESTED";
  return out;
}

/** T15 Span stability (5.3.3 / B.4): |Ec| <= mpe and max |Ec_i - Ec_j| <= max(0.5 e, 0.5 |mpe|); >= 8 measurements. */
export function t15SpanStability(c: Ctx, input: { rows: Array<R & { date?: string; zero?: R }> }): TestResult {
  const cfg = lim<any>(c.pack, "span_stability");
  const rows: Row[] = input.rows.map((r) => {
    if (!complete(r)) return { ...r, verdict: "NOT_TESTED" };
    const E0 = zeroError(c, r.zero);
    const Ec = clean(readingError(c.inst, c.pack, r) - E0);
    const m = mpe(c.inst, r.L, c.pack, { inService: c.opts.inService }).mpe_g;
    return { ...r, E0, Ec, mpe: m, verdict: within(Ec, m) };
  });
  const done = rows.filter((r) => r.verdict !== "NOT_TESTED");
  const notes: string[] = [];
  let spreadVerdict: Verdict = "NOT_TESTED";
  let spread = 0;
  let limit = 0;
  if (done.length >= 2) {
    const ecs = done.map((r) => r.Ec as number);
    spread = clean(Math.max(...ecs) - Math.min(...ecs));
    const L = done[0].L as number;
    const m = mpe(c.inst, L, c.pack).mpe_g;
    limit = clean(Math.max(0.5 * eAt(c.inst, L), 0.5 * m));
    spreadVerdict = lte(spread, limit) ? "PASS" : "FAIL";
  }
  if (done.length < cfg.min_measurements) notes.push(`${done.length} of at least ${cfg.min_measurements} measurements.`);
  let verdict = aggregate([...rows.map((r) => r.verdict), spreadVerdict]);
  if (verdict === "PASS" && done.length < cfg.min_measurements) verdict = "NOT_TESTED";
  return result(c, "T15", rows, notes, { summary: { spread_g: spread, spreadLimit_g: limit, spreadVerdict } }, verdict);
}

