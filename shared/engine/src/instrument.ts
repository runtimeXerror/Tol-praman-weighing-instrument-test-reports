import type { AccuracyClassDef, ClassBand } from "@tolpraman/rulepacks";
import { clean, gt, gte, isScaleIntervalForm, lte } from "./num";
import type { ClassId, InstrumentProfile, Issue, RangeDef, RulePack } from "./types";

export function normalizeClass(cls: string, pack: RulePack): ClassId {
  const c = String(cls).trim().toUpperCase();
  if (pack.accuracy_classes.some((a) => a.id === c)) return c as ClassId;
  const alias = pack.class_aliases[c];
  if (alias) return alias;
  throw new Error(`Unknown accuracy class "${cls}"`);
}

export function classDef(cls: string, pack: RulePack): AccuracyClassDef {
  const id = normalizeClass(cls, pack);
  return pack.accuracy_classes.find((a) => a.id === id)!;
}

export function classDisplay(cls: string, pack: RulePack): string {
  return classDef(cls, pack).display;
}

/** Ranges ascending. A single-range instrument is one range {Max, e}. */
export function rangesOf(inst: InstrumentProfile): RangeDef[] {
  if (inst.ranges && inst.ranges.length > 0) return [...inst.ranges].sort((a, b) => a.max_g - b.max_g);
  return [{ max_g: inst.max_g, e_g: inst.e_g }];
}

/**
 * Index of the (partial) range that contains the load: the first range with load <= Max_i.
 * Loads above Max fall in the last range. R76-1 3.3 example and A.4.4.3 note.
 */
export function rangeIndexFor(inst: InstrumentProfile, load_g: number): number {
  const rs = rangesOf(inst);
  const a = Math.abs(load_g);
  for (let i = 0; i < rs.length; i++) if (lte(a, rs[i].max_g)) return i;
  return rs.length - 1;
}

/** e applicable at a load (e_i of the partial range containing it). Near zero this is e1. */
export function eAt(inst: InstrumentProfile, load_g: number): number {
  return rangesOf(inst)[rangeIndexFor(inst, load_g)].e_g;
}

/** Smallest verification scale interval (e1). */
export function e1(inst: InstrumentProfile): number {
  return rangesOf(inst)[0].e_g;
}

export function findBand(def: AccuracyClassDef, e_g: number): ClassBand | undefined {
  return def.bands.find((b) => gte(e_g, b.e_min_g) && (b.e_max_g === null || lte(e_g, b.e_max_g)));
}

export interface RangeCheck {
  index: number;
  max_g: number;
  e_g: number;
  n: number;
  band: ClassBand | null;
}

export interface InstrumentValidation {
  cls: ClassId;
  classDisplay: string;
  n: number;
  valid: boolean;
  issues: Issue[];
  ranges: RangeCheck[];
  minRequired_g: number | null;
}

/** Instrument data checks: Table 3 / Table 17, Min, scale interval form, Table 4 / Table 18. */
export function validateInstrument(inst: InstrumentProfile, pack: RulePack): InstrumentValidation {
  const issues: Issue[] = [];
  let cls: ClassId;
  try {
    cls = normalizeClass(String(inst.cls), pack);
  } catch {
    return {
      cls: "III", classDisplay: String(inst.cls), n: NaN, valid: false, ranges: [], minRequired_g: null,
      issues: [{ code: "CLASS_UNKNOWN", severity: "error", message: `Unknown accuracy class "${inst.cls}"`, clause: pack.accuracy_classes[0]?.clause ?? "" }],
    };
  }
  const def = classDef(cls, pack);
  const tableClause = def.clause;
  const formClause = pack.scale_interval_form.clause;
  const mant = pack.scale_interval_form.mantissas;
  const rs = rangesOf(inst);
  const multi = rs.length > 1;

  const positive = (v: number, name: string) => {
    if (!(v > 0) || !Number.isFinite(v)) issues.push({ code: "NOT_POSITIVE", severity: "error", message: `${name} must be a positive number`, clause: tableClause });
  };
  positive(inst.max_g, "Max");
  positive(inst.e_g, "e");
  positive(inst.d_g, "d");
  if (!(inst.min_g >= 0)) issues.push({ code: "NOT_POSITIVE", severity: "error", message: "Min must be >= 0", clause: tableClause });
  if (issues.length) return { cls, classDisplay: def.display, n: NaN, valid: false, issues, ranges: [], minRequired_g: null };

  // Scale interval form 1, 2, 5 x 10^k
  for (const [name, v] of [["e", inst.e_g], ["d", inst.d_g], ...rs.map((r, i) => [`e${i + 1}`, r.e_g] as const)] as const) {
    if (!isScaleIntervalForm(v as number, mant)) {
      issues.push({ code: "SCALE_FORM", severity: "error", message: `${name} = ${v} g is not of the form 1, 2 or 5 x 10^k`, clause: formClause });
    }
  }

  // d and e: e = d, or auxiliary indicating device (classes I and II only, d < e <= 10 d)
  if (gt(inst.d_g, inst.e_g)) {
    issues.push({ code: "D_GT_E", severity: "error", message: "Actual scale interval d cannot exceed e", clause: tableClause });
  } else if (gt(inst.e_g, inst.d_g)) {
    if (cls === "III" || cls === "IIII") {
      issues.push({ code: "AUX_CLASS", severity: "error", message: "e > d (auxiliary indicating device) is permitted only for classes I and II", clause: "R76-1 3.4.1 / Hdg A Pt II 3(5)(i)" });
    }
    if (multi) issues.push({ code: "AUX_MULTI", severity: "error", message: "A multi-interval instrument shall not have an auxiliary indicating device", clause: "R76-1 3.4.1 / Hdg A Pt II 3(5)(ii)" });
    const classIsmall = cls === "I" && inst.d_g < 0.001;
    if (!classIsmall && gt(inst.e_g, 10 * inst.d_g)) {
      issues.push({ code: "AUX_RATIO", severity: "error", message: "With an auxiliary indicating device, d < e <= 10 d", clause: "R76-1 3.4.2 / Hdg A Pt II 3(5)(iii)" });
    }
  }

  // Class I, e < 1 mg
  if (cls === "I" && inst.e_g < 0.001 - 1e-15) {
    if (def.e_floor_g) {
      issues.push({ code: "E_FLOOR", severity: "info", message: `e < 1 mg is taken as ${def.e_floor_g * 1000} mg for verification`, clause: tableClause });
    } else {
      issues.push({ code: "E_BELOW_1MG", severity: "warning", message: "e < 1 mg is not normally feasible to test (uncertainty of test loads)", clause: tableClause });
    }
  }

  // Last range Max must equal instrument Max
  if (multi && Math.abs(rs[rs.length - 1].max_g - inst.max_g) > 1e-9 * inst.max_g) {
    issues.push({ code: "RANGE_MAX", severity: "error", message: "Max of the last range must equal Max of the instrument", clause: pack.multi_interval_boundary.clause });
  }
  if (multi && Math.abs(rs[0].e_g - inst.e_g) > 1e-12) {
    issues.push({ code: "RANGE_E1", severity: "error", message: "e must equal e1 of the first range", clause: pack.multi_interval_boundary.clause });
  }

  // Per range: e band, n limits
  const ranges: RangeCheck[] = rs.map((r, i) => {
    const eEff = def.e_floor_g && r.e_g < def.e_floor_g ? def.e_floor_g : r.e_g;
    const n = clean(r.max_g / r.e_g);
    const band = findBand(def, eEff) ?? null;
    const tag = multi ? ` (range ${i + 1})` : "";
    if (!band) {
      issues.push({ code: "E_BAND", severity: "error", message: `e${multi ? i + 1 : ""} = ${r.e_g} g is not permitted for class ${def.display}${tag}`, clause: tableClause });
    } else {
      const classIexempt = cls === "I" && inst.d_g < 0.0001; // n may be < 50 000 when d < 0.1 mg
      if (n < band.n_min - 1e-9 && !classIexempt) {
        issues.push({ code: "N_MIN", severity: "error", message: `n = ${n}${tag} is below the minimum ${band.n_min} for class ${def.display}`, clause: tableClause });
      }
      if (band.n_max !== null && n > band.n_max + 1e-9) {
        issues.push({ code: "N_MAX", severity: "error", message: `n = ${n}${tag} exceeds the maximum ${band.n_max} for class ${def.display}`, clause: tableClause });
      }
    }
    if (i > 0) {
      if (!(r.e_g > rs[i - 1].e_g)) issues.push({ code: "RANGE_ORDER", severity: "error", message: `e${i + 1} must be greater than e${i}`, clause: pack.multi_interval_boundary.clause });
      if (!(r.max_g > rs[i - 1].max_g)) issues.push({ code: "RANGE_ORDER", severity: "error", message: `Max${i + 1} must be greater than Max${i}`, clause: pack.multi_interval_boundary.clause });
    }
    return { index: i, max_g: r.max_g, e_g: r.e_g, n, band };
  });

  // Multi-interval: Max_i / e_(i+1) >= ratio (Table 4 / Table 18), all but the last range
  if (multi && (inst.rangeKind ?? "multi_interval") === "multi_interval") {
    const ratio = pack.multi_interval_boundary.min_ratio[cls];
    for (let i = 0; i < rs.length - 1; i++) {
      const v = clean(rs[i].max_g / rs[i + 1].e_g);
      if (v < ratio - 1e-9) {
        issues.push({ code: "MI_BOUNDARY", severity: "error", message: `Max${i + 1}/e${i + 2} = ${v} is below ${ratio} for class ${def.display}`, clause: pack.multi_interval_boundary.clause });
      }
    }
  }

  // Minimum capacity: Min >= k * e1 (d instead of e with an auxiliary device, R76-1 3.4.3); 5 e for grading instruments
  let minRequired_g: number | null = null;
  const b1 = ranges[0]?.band;
  if (b1) {
    let k = b1.min_capacity_e;
    const grading = pack.grading_min_capacity_e;
    let clause = tableClause;
    if (inst.grading && grading?.value) {
      k = grading.value;
      clause = grading.clause;
    }
    const base = gt(inst.e_g, inst.d_g) ? inst.d_g : Math.max(rs[0].e_g, def.e_floor_g ?? 0);
    minRequired_g = clean(k * base);
    if (inst.min_g < minRequired_g - 1e-9 * minRequired_g) {
      issues.push({ code: "MIN_CAPACITY", severity: "error", message: `Min = ${inst.min_g} g is below ${k} ${gt(inst.e_g, inst.d_g) ? "d" : "e"} = ${minRequired_g} g`, clause });
    }
  }
  if (inst.min_g >= inst.max_g) issues.push({ code: "MIN_GE_MAX", severity: "error", message: "Min must be less than Max", clause: tableClause });

  const nOverall = clean(rs[rs.length - 1].max_g / rs[rs.length - 1].e_g);
  return {
    cls,
    classDisplay: def.display,
    n: ranges.length === 1 ? ranges[0].n : nOverall,
    valid: !issues.some((x) => x.severity === "error"),
    issues,
    ranges,
    minRequired_g,
  };
}
