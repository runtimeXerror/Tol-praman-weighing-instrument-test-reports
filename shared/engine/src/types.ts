import type { ClassId, Profile, RulePack } from "@tolpraman/rulepacks";

export type { ClassId, Profile, RulePack };

/** Accepts "I" | "II" | "III" | "IIII" and the pack's aliases ("IV", "3", ...). */
export type AccuracyClass = ClassId | string;

export type Verdict = "PASS" | "CONDITIONAL" | "FAIL" | "NOT_APPLICABLE" | "NOT_TESTED";
export type DecisionRule = "simple" | "guarded";

export interface RangeDef {
  max_g: number;
  e_g: number;
}

export interface InstrumentProfile {
  cls: AccuracyClass;
  max_g: number;
  min_g: number;
  /** Verification scale interval of the first (or only) range. */
  e_g: number;
  /** Actual scale interval. */
  d_g: number;
  /**
   * Partial ranges (multi-interval) or ranges (multiple range), ascending.
   * Omit for a single-range instrument.
   */
  ranges?: RangeDef[];
  rangeKind?: "multi_interval" | "multiple_range";
  indication: "digital" | "analog" | "non_self";
  power: "mains" | "battery" | "external_dc" | "vehicle";
  electronic: boolean;
  directSale?: boolean;
  software?: boolean;
  liableToTilt?: boolean;
  hasTare?: boolean;
  maxTare_g?: number;
  /** Maximum additive tare effect T+ (eccentricity load, R76-1 3.6.2). */
  maxAdditiveTare_g?: number;
  supports?: number;
  receptor?: "normal" | "special" | "rolling";
  grading?: boolean;
  tempLow_C?: number;
  tempHigh_C?: number;
  levelIndicator?: boolean;
  tiltSensor?: boolean;
}

export interface Issue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  clause: string;
}

export interface Row {
  [k: string]: unknown;
  verdict: Verdict;
  clause?: string;
}

export interface TestResult {
  testId: string;
  name: string;
  clause: string;
  rows: Row[];
  verdict: Verdict;
  notes: string[];
  summary?: Record<string, number | string | boolean | null>;
}

export interface EvalOptions {
  inService?: boolean;
  rule?: DecisionRule;
  /** Expanded uncertainty U (k=2) as a function of load, used by the guarded rule. */
  uncertainty?: (load_g: number) => number;
}

export interface Ctx {
  inst: InstrumentProfile;
  pack: RulePack;
  opts: EvalOptions;
}
