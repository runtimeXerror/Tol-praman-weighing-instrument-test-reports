import { e1, eAt, normalizeClass } from "../instrument";
import { readingError, type Reading } from "../error";
import { lim } from "../limits";
import { mpe } from "../mpe";
import { clean, isNum, lte, stdev } from "../num";
import { aggregate, within } from "../verdict";
import type { Ctx, Row, RulePack, TestResult, Verdict } from "../types";
import { complete, notApplicable, result, zeroError } from "./common";

type R = Partial<Reading> & Record<string, unknown>;

/** Extra load for the discrimination test at a load (R76-1 3.8 / Hdg A 3(8)). */
export function discriminationExtraLoad(c: Ctx, L: number): { extra_g: number; rule: string } {
  const cfg = lim<any>(c.pack, "discrimination");
  const minExtra: number | null = cfg.min_extra_load_g;
  const floor = (x: number) => clean(minExtra ? Math.max(x, minExtra) : x);
  const m = mpe(c.inst, L, c.pack).mpe_g;
  switch (c.inst.indication) {
    case "digital": return { extra_g: clean(cfg.digital.extra_load_d * c.inst.d_g), rule: `${cfg.digital.extra_load_d} d` };
    case "analog": return { extra_g: floor(cfg.analog.extra_load_mpe * m), rule: `${cfg.analog.extra_load_mpe} |mpe|` };
    default: return { extra_g: floor(cfg.non_self.extra_load_mpe * m), rule: `${cfg.non_self.extra_load_mpe} |mpe|` };
  }
}

/**
 * T04 Discrimination (3.8 / A.4.8), three loads (Min, 1/2 Max, Max).
 * digital: I2 - I1 >= d after adding 1.4 d; analog: I2 - I1 >= 0.7 x extra; non-self: visible displacement.
 */
export function t04Discrimination(c: Ctx, input: { rows: Array<{ L?: number; I1?: number; I2?: number; visible?: boolean }> }): TestResult {
  const cfg = lim<any>(c.pack, "discrimination");
  const kind = c.inst.indication;
  if (kind === "digital" && cfg.digital.applies_if_d_g_gte !== null && c.inst.d_g < cfg.digital.applies_if_d_g_gte - 1e-15) {
    return notApplicable(c, "T04", `Digital discrimination applies only to d >= ${cfg.digital.applies_if_d_g_gte * 1000} mg (${cfg.digital.clause}).`);
  }
  const rows: Row[] = input.rows.map((r) => {
    if (!isNum(r.L)) return { ...r, verdict: "NOT_TESTED" };
    const { extra_g, rule } = discriminationExtraLoad(c, r.L);
    if (kind === "non_self") {
      if (typeof r.visible !== "boolean") return { ...r, extra_g, rule, verdict: "NOT_TESTED" };
      return { ...r, extra_g, rule, verdict: r.visible ? "PASS" : "FAIL", clause: cfg.non_self.clause };
    }
    if (!isNum(r.I1) || !isNum(r.I2)) return { ...r, extra_g, rule, verdict: "NOT_TESTED" };
    const change = clean(r.I2 - r.I1);
    const required = kind === "digital" ? c.inst.d_g : clean(cfg.analog.min_displacement_fraction * extra_g);
    return { ...r, extra_g, rule, change, required, verdict: lte(required, change) ? "PASS" : "FAIL", clause: cfg[kind].clause };
  });
  return result(c, "T04", rows);
}

/** Required permanent displacement for the sensitivity test (6.1). */
export function sensitivityRequired_mm(c: Ctx): number {
  const cfg = lim<any>(c.pack, "sensitivity_mm");
  const cls = normalizeClass(String(c.inst.cls), c.pack);
  for (const r of cfg.rules as any[]) {
    if (!r.classes.includes(cls)) continue;
    if (isNum(r.max_g_lte) && !(c.inst.max_g <= r.max_g_lte)) continue;
    if (isNum(r.max_g_gt) && !(c.inst.max_g > r.max_g_gt)) continue;
    return r.min_displacement_mm;
  }
  throw new Error(`No sensitivity rule for class ${cls}`);
}

/** T05 Sensitivity of a non-self-indicating instrument (6.1 / A.4.9). */
export function t05Sensitivity(c: Ctx, input: { rows: Array<{ L?: number; displacement_mm?: number }> }): TestResult {
  if (c.inst.indication !== "non_self") return notApplicable(c, "T05", "Applies only to non-self-indicating instruments.");
  const req = sensitivityRequired_mm(c);
  const rows: Row[] = input.rows.map((r) => {
    if (!isNum(r.L) || !isNum(r.displacement_mm)) return { ...r, required_mm: req, verdict: "NOT_TESTED" };
    const extra = Math.max(mpe(c.inst, r.L, c.pack).mpe_g, 0.001);
    return { ...r, extra_g: clean(extra), required_mm: req, verdict: r.displacement_mm >= req - 1e-9 ? "PASS" : "FAIL" };
  });
  return result(c, "T05", rows, [`Required displacement: ${req} mm.`]);
}

/** Required repeatability series size (A.4.10). */
export function repeatabilityCount(c: Ctx): number {
  const s = lim<any>(c.pack, "repeatability").series_size;
  return c.inst.max_g < s.max_below_g ? s.small : s.large_min;
}

/**
 * T06 Repeatability (3.6.1 / A.4.10): per series, Emax - Emin <= |mpe| and each |E| <= mpe.
 * Returns u_rep (sample standard deviation of the indications) per series for the uncertainty budget.
 */
export function t06Repeatability(c: Ctx, input: { series: Array<{ L?: number; readings: Array<{ I?: number; dL?: number | null }> }> }): TestResult {
  const need = repeatabilityCount(c);
  const rows: Row[] = [];
  const notes: string[] = [];
  const summary: Record<string, number> = {};
  input.series.forEach((s, si) => {
    const L = s.L;
    const done = s.readings.filter((r) => isNum(r.I));
    if (!isNum(L) || done.length === 0) { rows.push({ series: si + 1, L, verdict: "NOT_TESTED" }); return; }
    const m = mpe(c.inst, L, c.pack, { inService: c.opts.inService }).mpe_g;
    const Es = done.map((r) => readingError(c.inst, c.pack, { L, I: r.I as number, dL: r.dL ?? null }));
    const spread = clean(Math.max(...Es) - Math.min(...Es));
    const eachOk = Es.every((E) => lte(Math.abs(E), m));
    let v: Verdict = eachOk && lte(spread, m) ? "PASS" : "FAIL";
    if (v === "PASS" && done.length < need) { v = "NOT_TESTED"; notes.push(`Series ${si + 1}: ${done.length} of ${need} weighings.`); }
    const s_rep = clean(stdev(Es));
    summary[`u_rep_${si + 1}`] = s_rep;
    rows.push({ series: si + 1, L, n: done.length, Emax: Math.max(...Es), Emin: Math.min(...Es), spread, mpe: m, s: s_rep, E: Es, verdict: v });
  });
  return result(c, "T06", rows, notes, { summary });
}

/** T08 Stability of equilibrium (4.4.2 / A.4.12). */
export function t08Stability(c: Ctx, input: { prints?: Array<{ printed?: number; min?: number; max?: number }>; zeroTare?: Array<R> }): TestResult {
  const cfg = lim<any>(c.pack, "stable_equilibrium_e");
  const rows: Row[] = [];
  for (const p of input.prints ?? []) {
    if (!isNum(p.printed) || !isNum(p.min) || !isNum(p.max)) { rows.push({ ...p, kind: "print", verdict: "NOT_TESTED" }); continue; }
    const e = eAt(c.inst, p.printed);
    const dev = clean(Math.max(Math.abs(p.printed - p.min), Math.abs(p.max - p.printed)));
    rows.push({ ...p, kind: "print", deviation: dev, limit: cfg.value * e, verdict: within(dev, cfg.value * e), clause: cfg.clause });
  }
  for (const z of input.zeroTare ?? []) {
    if (!complete(z)) { rows.push({ ...z, kind: "zero_tare", verdict: "NOT_TESTED" }); continue; }
    const E0 = zeroError(c, z);
    const limit = clean(cfg.zero_tare_limit_e * e1(c.inst));
    rows.push({ ...z, kind: "zero_tare", E0, limit, verdict: within(E0, limit) });
  }
  const notes = [`${cfg.repeats} repetitions; readings observed for ${cfg.observe_seconds} s after print-out.`];
  return result(c, "T08", rows, notes);
}

/**
 * T09 Tilting (3.9.1 / A.5.1). Rows per direction: a no-load reading (L = 0) and loaded readings.
 * No load: |E0(tilt) - E0(ref)| <= 2 e (class II excluded, unless direct sale where the pack allows it).
 * Loaded: Ec = E - E0 of the same tilt <= mpe.
 */
export function t09Tilting(c: Ctx, input: { tilt_per_mille?: number; rows: Array<R & { direction: string }> }): TestResult {
  const cfg = lim<any>(c.pack, "tilting");
  const cls = normalizeClass(String(c.inst.cls), c.pack);
  if (!cfg.classes.includes(cls)) return notApplicable(c, "T09", `Tilting applies to classes ${cfg.classes.join(", ")}.`);
  if (c.inst.liableToTilt === false) return notApplicable(c, "T09", "Instrument not liable to be tilted (fixed / suspended).");
  const noLoadApplies = !cfg.no_load_limit_excluded_classes.includes(cls) || (cfg.no_load_excluded_unless_direct_sale && c.inst.directSale);
  const zeroOf = (dir: string) => {
    const z = input.rows.find((r) => r.direction === dir && r.L === 0 && isNum(r.I));
    return z ? zeroError(c, z) : null;
  };
  const ref0 = zeroOf("ref");
  const rows: Row[] = input.rows.map((r) => {
    if (!complete(r)) return { ...r, verdict: "NOT_TESTED" };
    const E0dir = zeroOf(r.direction);
    if (r.L === 0) {
      if (r.direction === "ref") return { ...r, E0: E0dir, verdict: "PASS", note: "reference zero" };
      if (!noLoadApplies) return { ...r, E0: E0dir, verdict: "NOT_APPLICABLE", note: `no-load limit not applicable to class ${cls}` };
      if (ref0 === null || E0dir === null) return { ...r, verdict: "NOT_TESTED" };
      const d = clean(E0dir - ref0);
      const limit = clean(cfg.no_load_limit_e * e1(c.inst));
      return { ...r, E0: E0dir, change: d, limit, verdict: within(d, limit), clause: cfg.clause };
    }
    const E = readingError(c.inst, c.pack, r);
    const Ec = clean(E - (E0dir ?? 0));
    const m = mpe(c.inst, r.L, c.pack, { inService: c.opts.inService }).mpe_g;
    return { ...r, E, Ec, mpe: m, verdict: within(Ec, m), clause: cfg.clause };
  });
  const tiltNote = cfg.limit_rule ?? `limiting value of tilting (default ${cfg.default_limit_per_mille}/1000)`;
  const notes = [`Tilt: ${isNum(input.tilt_per_mille) ? `${input.tilt_per_mille}/1000 applied; ` : ""}${tiltNote}.`];
  return result(c, "T09", rows, notes);
}

/** T13 Disturbances (5.3.4 / B.3): |I_with - I_without| <= e, or a significant fault is detected and acted upon. */
export function t13Disturbances(c: Ctx, input: { rows: Array<{ disturbance: string; L?: number; I_without?: number; I_with?: number; faultDetected?: boolean }> }): TestResult {
  const k = lim<{ value: number; clause: string }>(c.pack, "significant_fault_e");
  const rows: Row[] = input.rows.map((r) => {
    if (r.faultDetected === true) return { ...r, verdict: "PASS", note: "significant fault detected and acted upon" };
    if (!isNum(r.L) || !isNum(r.I_without) || !isNum(r.I_with)) return { ...r, verdict: "NOT_TESTED" };
    const fault = clean(r.I_with - r.I_without);
    const limit = clean(k.value * eAt(c.inst, r.L));
    return { ...r, fault, limit, verdict: within(fault, limit), clause: k.clause };
  });
  return result(c, "T13", rows);
}

export interface ChecklistItem {
  id: string;
  group?: string;
  label: string;
  clause?: string;
  mandatory?: boolean;
  value?: "yes" | "no" | "na" | null;
  remark?: string;
}

/** The examination items for a pack; packs older than 2006.1.1 have none and use the legacy list. */
export function checklistFor(pack: RulePack): ChecklistItem[] {
  const t = pack.tests.find((x) => x.id === "T17");
  return (t?.checklist ?? DEFAULT_CHECKLIST).map((i) => ({ ...i }));
}

/**
 * T17 Examination checklist: every mandatory item must be "yes"; optional items may be "na"; any "no" fails.
 * Label, clause and the mandatory flag come from the rule pack, never from the submitted form.
 */
export function t17Checklist(c: Ctx, input: { items: ChecklistItem[] }): TestResult {
  const defs = new Map(checklistFor(c.pack).map((d) => [d.id, d]));
  const rows: Row[] = input.items.map((raw) => {
    const d = defs.get(raw.id);
    const it = d ? { ...raw, label: d.label, clause: d.clause, mandatory: !!d.mandatory, group: d.group } : raw;
    let v: Verdict;
    if (!it.value) v = "NOT_TESTED";
    else if (it.value === "yes") v = "PASS";
    else if (it.value === "na") v = it.mandatory ? "FAIL" : "NOT_APPLICABLE";
    else v = "FAIL";
    return { ...it, verdict: v };
  });
  const notes: string[] = [];
  const given = new Set(input.items.map((i) => i.id));
  const missing = [...defs.values()].filter((d) => d.mandatory && !given.has(d.id));
  if (missing.length) {
    notes.push(`Mandatory items missing from the form: ${missing.map((m) => m.label).join("; ")}.`);
    for (const m of missing) rows.push({ ...m, value: null, verdict: "NOT_TESTED" });
  }
  return result(c, "T17", rows, notes, {}, aggregate(rows.map((r) => r.verdict)));
}

/**
 * T18 Zero-setting, R76-1 4.5.1 / 4.5.2 / A.4.2 (Hdg A Pt II 4).
 * Range: initial zero-setting (positive + negative portion) and overall zero-setting + zero-tracking, as % of Max.
 * Accuracy: E0 after zero-setting (A.4.2.3.1: L = 0, extra load dL at which 0 -> e; A.4.2.3.2: at about 10 e).
 */
export function t18ZeroSetting(c: Ctx, input: {
  initial_pos_g?: number; initial_neg_g?: number; overall_g?: number;
  commercial?: boolean; widerInitialTested?: boolean;
  accuracy: Array<R & { mode?: "non_automatic" | "automatic" }>;
}): TestResult {
  const rules = lim<any>(c.pack, "zero_setting_range_rules");
  const initial = lim<{ value: number; clause: string }>(c.pack, "initial_zero_setting_pct_max");
  const overall = lim<{ value: number; clause: string }>(c.pack, "zero_setting_range_pct_max");
  const acc = lim<{ value: number; clause: string; auxiliary_device_limit_d?: number | null }>(c.pack, "zero_setting_accuracy_e");
  const pct = (g: number) => clean((g / c.inst.max_g) * 100);
  const rows: Row[] = [];
  const notes: string[] = [];
  let incomplete = false;

  if (isNum(input.initial_pos_g)) {
    const range_g = clean(input.initial_pos_g + (isNum(input.initial_neg_g) ? input.initial_neg_g : 0));
    let verdict = within(pct(range_g), initial.value);
    if (verdict === "FAIL" && rules.initial_wider_allowed_if_tested && input.widerInitialTested) {
      verdict = "PASS";
      notes.push(`Initial zero-setting range above ${initial.value} % of Max accepted: supplementary weighing test done (${rules.wider_clause}).`);
    }
    rows.push({ kind: "initial_range", range_g, pct: pct(range_g), limit_pct: initial.value, verdict, clause: initial.clause });
  }
  if (isNum(input.overall_g)) {
    const exempt = rules.class_IIII_exempt_unless_commercial && normalizeClass(String(c.inst.cls), c.pack) === "IIII" && !input.commercial;
    rows.push({ kind: "overall_range", range_g: input.overall_g, pct: pct(input.overall_g), limit_pct: overall.value, verdict: exempt ? "NOT_APPLICABLE" : within(pct(input.overall_g), overall.value), clause: overall.clause });
    if (exempt) notes.push(`Class IIII not used for commercial transactions: the ${overall.value} % limit does not apply (${overall.clause}).`);
  }
  if (!rows.length) {
    incomplete = true;
    notes.push("Zero-setting range not recorded (A.4.2.1).");
  }

  // Auxiliary indicating device (d < e): Heading A limits the zero deviation to 0.5 d instead of 0.25 e.
  const e = e1(c.inst);
  const aux = isNum(acc.auxiliary_device_limit_d) && c.inst.d_g < e - 1e-15;
  const limit = clean(aux ? acc.auxiliary_device_limit_d! * c.inst.d_g : acc.value * e);
  const readings = input.accuracy ?? [];
  for (const r of readings) {
    if (!complete(r)) { rows.push({ ...r, kind: "accuracy", verdict: "NOT_TESTED" }); continue; }
    const E0 = readingError(c.inst, c.pack, r);
    rows.push({ ...r, kind: "accuracy", E0, limit, verdict: within(E0, limit), clause: acc.clause });
  }
  if (!readings.some(complete)) {
    incomplete = true;
    notes.push("No zero-setting accuracy reading (A.4.2.3).");
  }
  if (readings.some((r) => r.mode === "automatic")) notes.push("Automatic zero-setting / zero-tracking: the error at about 10 e is taken as the error at zero (A.4.2.3.2).");
  if (aux) notes.push(`Auxiliary indicating device: limit ${acc.auxiliary_device_limit_d} d (${acc.clause}).`);

  const out = result(c, "T18", rows, notes);
  if (incomplete && out.verdict !== "FAIL") out.verdict = "NOT_TESTED";
  return out;
}

/** Legacy examination checklist, used only for cases locked to packs without a T17 checklist. */
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "doc", label: "Documentation complete and consistent with the instrument", clause: "R76-1 8.2.1 / A.1", mandatory: true },
  { id: "construction", label: "Construction conforms to the documentation", clause: "R76-1 8.2.2 / A.2", mandatory: true },
  { id: "markings", label: "Descriptive markings: manufacturer, type, Max, Min, e, class, serial no.", clause: "R76-1 7.1", mandatory: true },
  { id: "class_mark", label: "Accuracy class marked in the prescribed form (oval)", clause: "R76-1 3.1.1 / 7.1.1", mandatory: true },
  { id: "sealing", label: "Provision for sealing / securing of adjustment and components", clause: "R76-1 4.1.2.4 / 7.2", mandatory: true },
  { id: "display_test", label: "Display test on switch-on shows all segments", clause: "R76-1 5.3.1", mandatory: false },
  { id: "max_9e", label: "No indication above Max + 9 e", clause: "R76-1 4.2.3", mandatory: true },
  { id: "zero_range", label: "Zero-setting range <= 4 % Max; initial zero-setting <= 20 % Max", clause: "R76-1 4.5.1", mandatory: true },
  { id: "level", label: "Level indicator fitted where the instrument is liable to be tilted", clause: "R76-1 3.9.1.1", mandatory: false },
  { id: "software", label: "Software identification displayed and legally relevant software protected", clause: "R76-1 5.5", mandatory: false },
  { id: "interfaces", label: "Interfaces cannot inadmissibly influence metrological functions", clause: "R76-1 5.3.6", mandatory: false },
];
