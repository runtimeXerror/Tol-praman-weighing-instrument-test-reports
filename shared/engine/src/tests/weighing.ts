import { e1, normalizeClass } from "../instrument";
import { lim } from "../limits";
import { mpe } from "../mpe";
import { clean, gt, isNum, lte } from "../num";
import { within } from "../verdict";
import type { Reading } from "../error";
import type { Ctx, Row, TestResult } from "../types";
import { complete, result, weighRow, zeroError } from "./common";

type R = Partial<Reading> & Record<string, unknown>;

/** T01 Weighing performance, R76-1 A.4.4 (increasing and decreasing loads). */
export function t01Weighing(c: Ctx, input: { zero?: R; rows: Array<R & { dir?: "up" | "down" }>; initial?: boolean }): TestResult {
  const E0 = zeroError(c, input.zero);
  const rows = input.rows.map((r) => weighRow(c, r, E0));
  const notes: string[] = [];
  const up = new Set(input.rows.filter((r) => (r.dir ?? "up") === "up" && isNum(r.L)).map((r) => r.L as number));
  const need = lim<{ initial: number; other: number }>(c.pack, "weighing_test_min_loads")[input.initial === false ? "other" : "initial"];
  if (up.size > 0 && up.size < need) notes.push(`Only ${up.size} different test loads; at least ${need} required (A.4.4.1).`);
  if (up.size > 0 && ![...up].some((L) => Math.abs(L - c.inst.max_g) <= 1e-9 * c.inst.max_g)) notes.push("Test loads should include Max.");
  const out = result(c, "T01", rows, notes);
  if (out.verdict === "PASS" && up.size < need) out.verdict = "NOT_TESTED";
  return out;
}

/** Recommended eccentricity test load, R76-1 3.6.2. */
export function eccentricityLoad(c: Ctx): { load_g: number; rule: string } {
  const f = lim<any>(c.pack, "eccentricity").load_fraction;
  const total = c.inst.max_g + (c.inst.maxAdditiveTare_g ?? 0);
  const n = c.inst.supports ?? 4;
  if (c.inst.receptor === "special") return { load_g: clean(total * f.special_receptor), rule: "1/10 (Max + T+) per support (3.6.2.3)" };
  if (c.inst.receptor === "rolling") return { load_g: clean(total * f.rolling_max), rule: "usual rolling load, <= 0.8 (Max + T+) (3.6.2.4)" };
  if (n > 4) return { load_g: clean(total / (n - 1)), rule: `1/(n-1) (Max + T+) per support, n = ${n} (3.6.2.2)` };
  return { load_g: clean(total * f.le_4_supports), rule: "1/3 (Max + T+) (3.6.2.1)" };
}

/** T03 Eccentricity, R76-1 A.4.7. E0 may be given once or per position. */
export function t03Eccentricity(c: Ctx, input: { zero?: R; rows: Array<R & { position: string; zero?: R }> }): TestResult {
  const E0all = zeroError(c, input.zero);
  const rows = input.rows.map((r) => weighRow(c, r, r.zero ? zeroError(c, r.zero) : E0all));
  const rec = eccentricityLoad(c);
  return result(c, "T03", rows, [`Recommended load ${+rec.load_g.toFixed(2)} g: ${rec.rule}.`], { summary: { recommendedLoad_g: rec.load_g } });
}

/** T10 Tare: weighing tests on the net load at different tare values; tare-setting accuracy 0.25 e. */
export function t10Tare(c: Ctx, input: { rows: Array<R & { tare_g: number; zero?: R }>; setting?: Array<R> }): TestResult {
  const rows: Row[] = input.rows.map((r) => ({ ...weighRow(c, r, zeroError(c, r.zero)), tare_g: r.tare_g }));
  const acc = lim<{ value: number; clause: string }>(c.pack, "tare_setting_accuracy_e");
  for (const s of input.setting ?? []) {
    if (!complete(s)) { rows.push({ ...s, kind: "tare_setting", verdict: "NOT_TESTED" }); continue; }
    const E0 = zeroError(c, s);
    const limit = clean(acc.value * e1(c.inst));
    rows.push({ ...s, kind: "tare_setting", E0, limit, verdict: within(E0, limit), clause: acc.clause });
  }
  return result(c, "T10", rows);
}

/** T12 Power supply variations, R76-1 A.5.4. Rows grouped by condition with their own zero. */
export function t12Power(c: Ctx, input: { rows: Array<R & { condition: string; U_V?: number; zero?: R }> }): TestResult {
  const rows = input.rows.map((r) => ({ ...weighRow(c, r, zeroError(c, r.zero)), condition: r.condition, U_V: r.U_V }));
  const ps = lim<any>(c.pack, "power_supply");
  const notes = [`Mains AC: ${ps.mains_ac.lower_factor} Unom to ${ps.mains_ac.upper_factor} Unom${ps.mains_ac.frequency_lower_factor ? `; frequency ${ps.mains_ac.frequency_lower_factor} to ${ps.mains_ac.frequency_upper_factor} fnom` : ""}.`];
  return result(c, "T12", rows, notes);
}

/** T14 Damp heat, steady state (B.2): three phases (reference, high T at 85 % RH, reference). */
export function t14DampHeat(c: Ctx, input: { phases: Array<{ phase: string; T_C?: number; RH_pct?: number; zero?: R; rows: R[] }> }): TestResult {
  const min = lim<any>(c.pack, "damp_heat").min_test_loads as number;
  const rows: Row[] = [];
  const notes: string[] = [];
  for (const p of input.phases) {
    const E0 = zeroError(c, p.zero);
    for (const r of p.rows) rows.push({ ...weighRow(c, r, E0), phase: p.phase, T_C: p.T_C, RH_pct: p.RH_pct });
    const n = p.rows.filter(complete).length;
    if (n > 0 && n < min) notes.push(`Phase "${p.phase}": ${n} loads; at least ${min} required.`);
  }
  if (input.phases.length < 3) notes.push("Three phases required: reference, high temperature / 85 % RH, reference.");
  return result(c, "T14", rows, notes);
}

/** T16 Endurance (A.6): durability error = E_after - E_before at the same load, <= |mpe|. */
export function t16Endurance(c: Ctx, input: { before: { zero?: R; rows: R[] }; after: { zero?: R; rows: R[] }; cycles?: number }): TestResult {
  const b0 = zeroError(c, input.before.zero);
  const a0 = zeroError(c, input.after.zero);
  const before = input.before.rows.map((r) => weighRow(c, r, b0));
  const after = input.after.rows.map((r) => weighRow(c, r, a0));
  const cfg = lim<any>(c.pack, "endurance");
  const rows: Row[] = after.map((a) => {
    const b = before.find((x) => isNum(x.L) && isNum(a.L) && Math.abs((x.L as number) - (a.L as number)) < 1e-9);
    if (!b || a.verdict === "NOT_TESTED" || b.verdict === "NOT_TESTED") return { L: a.L, verdict: "NOT_TESTED" };
    const dur = clean((a.Ec as number) - (b.Ec as number));
    const m = mpe(c.inst, a.L as number, c.pack, { inService: c.opts.inService });
    const v = within(dur, m.mpe_g);
    return { L: a.L, Ec_before: b.Ec, Ec_after: a.Ec, durability: dur, mpe: m.mpe_g, verdict: a.verdict === "FAIL" ? "FAIL" : v, clause: cfg.clause };
  });
  const notes = [`Load about ${cfg.load_fraction * 100} % of Max applied ${cfg.cycles} times.`];
  if (isNum(input.cycles) && input.cycles < cfg.cycles) notes.push(`Only ${input.cycles} cycles recorded.`);
  return result(c, "T16", rows, notes);
}

/**
 * Absolute humidity (g/m3) from temperature and relative humidity (Magnus formula over water).
 * Used to check the A.5.3.1 / Hdg A 9(13)(i) limit of 20 g/m3 (R76-1 note: 39 % RH at 40 C).
 */
export function absoluteHumidity(T_C: number, RH_pct: number): number {
  const es_hPa = 6.112 * Math.exp((17.62 * T_C) / (243.12 + T_C));
  return clean((216.7 * (RH_pct / 100) * es_hPa) / (273.15 + T_C));
}

/** Temperatures at which A.5.3.1 requires a weighing test, in order, for this instrument and pack. */
export function staticTemperaturePlan(c: Ctx): { reference_C: number; low_C: number; high_C: number; required: Array<{ T_C: number; label: string }> } {
  const cfg = lim<any>(c.pack, "static_temperatures");
  const def = lim<{ low: number; high: number }>(c.pack, "temperature_range_default_C");
  const low_C = isNum(c.inst.tempLow_C) ? c.inst.tempLow_C : def.low;
  const high_C = isNum(c.inst.tempHigh_C) ? c.inst.tempHigh_C : def.high;
  const classI = normalizeClass(String(c.inst.cls), c.pack) === "I";
  const reference_C = classI && cfg.class_I_ref === "mean_of_limits" ? clean((low_C + high_C) / 2) : cfg.ref_temperature_C;
  const x = cfg.extra_if_low as { op: "lte" | "lt"; C: number };
  const extra = (x.op === "lt" ? low_C < x.C : lte(low_C, x.C)) && Math.abs(low_C - cfg.extra_temperature_C) > cfg.match_tolerance_C;
  const required = [
    { T_C: reference_C, label: "reference" },
    { T_C: high_C, label: "high" },
    { T_C: low_C, label: "low" },
    ...(extra ? [{ T_C: cfg.extra_temperature_C as number, label: `${cfg.extra_temperature_C} °C` }] : []),
    { T_C: reference_C, label: "reference, again at the end" },
  ];
  return { reference_C, low_C, high_C, required };
}

/**
 * T19 Static temperatures, R76-1 3.9.2.1 / 3.9.2.2 / A.5.3.1 (Hdg A Pt II 3(9)(ii) / 9(13)(i)).
 * A weighing test (A.4.4.1) at the reference, high, low (and 5 C) and again the reference temperature;
 * every |Ec| <= mpe. Missing temperatures or out-of-limit humidity make the test incomplete.
 */
export function t19StaticTemperatures(c: Ctx, input: { phases: Array<{ T_C?: number; RH_pct?: number; p_hPa?: number; zero?: R; rows: R[] }> }): TestResult {
  const cfg = lim<any>(c.pack, "static_temperatures");
  const span = lim<Record<string, number | string>>(c.pack, "temperature_range_min_span_C");
  const minLoads = lim<{ other: number }>(c.pack, "weighing_test_min_loads").other;
  const plan = staticTemperaturePlan(c);
  const cls = normalizeClass(String(c.inst.cls), c.pack);
  const rows: Row[] = [];
  const notes: string[] = [];
  let incomplete = false;

  const phases = input.phases ?? [];
  for (const p of phases) {
    const E0 = zeroError(c, p.zero);
    for (const r of p.rows ?? []) rows.push({ ...weighRow(c, r, E0), T_C: p.T_C, RH_pct: p.RH_pct });
    const n = (p.rows ?? []).filter(complete).length;
    if (n > 0 && n < minLoads) {
      incomplete = true;
      notes.push(`${p.T_C ?? "?"} °C: ${n} loads; at least ${minLoads} required (A.4.4.1).`);
    }
    const hot = isNum(p.T_C) && Math.abs(p.T_C - plan.high_C) <= cfg.match_tolerance_C;
    if (isNum(p.T_C) && isNum(p.RH_pct) && (cfg.abs_humidity_applies === "all" || hot)) {
      const ah = absoluteHumidity(p.T_C, p.RH_pct);
      if (gt(ah, cfg.abs_humidity_max_g_m3)) {
        incomplete = true;
        notes.push(`${p.T_C} °C / ${p.RH_pct} % RH = ${Math.round(ah * 10) / 10} g/m3: absolute humidity above ${cfg.abs_humidity_max_g_m3} g/m3 (${cfg.clause}); repeat at lower humidity.`);
      }
    }
  }

  // Each required temperature needs its own phase with readings (the reference twice).
  const done = phases.filter((p) => isNum(p.T_C) && (p.rows ?? []).some(complete)).map((p) => p.T_C as number);
  const used = new Set<number>();
  for (const req of plan.required) {
    const k = done.findIndex((T, i) => !used.has(i) && Math.abs(T - req.T_C) <= cfg.match_tolerance_C);
    if (k >= 0) used.add(k);
    else {
      incomplete = true;
      notes.push(`Missing weighing test at ${req.T_C} °C (${req.label}).`);
    }
  }

  const minSpan = span[cls];
  if (typeof minSpan === "number" && plan.high_C - plan.low_C < minSpan) {
    notes.push(`Temperature limits ${plan.low_C} / ${plan.high_C} °C: the range must be at least ${minSpan} °C for class ${cls} (${span.clause}).`);
  }
  if (cls === "I") notes.push("Class I: take changes in barometric pressure into account.");
  if (cfg.note) notes.push(cfg.note);

  const out = result(c, "T19", rows, notes, {
    summary: { reference_C: plan.reference_C, low_C: plan.low_C, high_C: plan.high_C, required: plan.required.map((r) => r.T_C).join(", ") },
  });
  if (incomplete && out.verdict !== "FAIL") out.verdict = "NOT_TESTED";
  return out;
}
