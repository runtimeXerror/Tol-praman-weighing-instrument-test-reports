export type Profile = "OIML" | "IN";
export type ClassId = "I" | "II" | "III" | "IIII";

export interface ClassBand {
  e_min_g: number;
  e_max_g: number | null;
  n_min: number;
  n_max: number | null;
  min_capacity_e: number;
}

export interface AccuracyClassDef {
  id: ClassId;
  name: string;
  display: string;
  clause: string;
  bands: ClassBand[];
  notes?: string[];
  /** India: e < 1 mg is taken as 1 mg for verification (Table 17 note). */
  e_floor_g?: number;
}

export interface MpeBand {
  /** Upper bound of the band in multiples of e (inclusive). null = open-ended. */
  m_max_e: number | null;
  mpe_e: number;
}

export interface Clause {
  clause: string;
}

export interface Applicability {
  classes?: ClassId[];
  electronic?: boolean;
  indication?: Array<"digital" | "analog" | "non_self">;
  max_g_lte?: number;
  liable_to_tilt?: boolean;
  has_tare?: boolean;
  not?: { classes?: ClassId[]; class_II_e_below_g?: number };
}

export interface TestDef {
  id: string;
  name: string;
  clause: string;
  inputs: string[];
  pass: string;
  applies_if: Applicability;
  variants?: Record<string, string>;
  report_section?: string;
  /** T17 examination items: the pack decides which items exist and which are mandatory. */
  checklist?: ChecklistDef[];
  checklist_note?: string;
}

export interface ChecklistDef {
  id: string;
  group?: string;
  label: string;
  clause: string;
  mandatory: boolean;
}

/**
 * General limits are read by the engine by key. They are kept loosely typed on purpose:
 * the pack is the source of truth, and the engine reads exactly the keys it needs through
 * typed accessors in @tolpraman/engine (limits.ts), failing loudly if a key is missing.
 */
export type GeneralLimits = Record<string, any>;

export interface RulePack {
  id: string;
  profile: Profile;
  version: string;
  title: string;
  extends?: string;
  source: { documents: Array<{ ref: string; file?: string; url?: string; ocr?: string }>; clause_prefix?: string };
  units?: Record<string, string>;
  scale_interval_form: { clause: string; mantissas: number[]; note?: string };
  accuracy_classes: AccuracyClassDef[];
  class_aliases: Record<string, ClassId>;
  grading_min_capacity_e?: { value: number | null; clause: string };
  mpe_initial_verification: { clause: string; unit?: string; label?: string; bands: Record<ClassId, MpeBand[]>; boundary_rule?: string };
  mpe_in_service_multiplier: { value: number; clause: string; label?: string };
  multi_interval_boundary: { clause: string; rule?: string; min_ratio: Record<ClassId, number>; e_select_clause?: string };
  general_limits: GeneralLimits;
  error_formula: Record<string, string>;
  tests: TestDef[];
  verdict_policy: { default_rule: "simple" | "guarded"; rules: Record<string, string>; aggregate: string; clause: string };
  /** Extension packs: where this profile differs from its base standard, for the report. */
  differences_from_base?: Array<{ topic: string; base: string; profile: string; clause: string }>;
}

export interface LoadedPack {
  pack: Readonly<RulePack>;
  /** sha256 (hex) of the canonical JSON of the resolved pack. */
  packHash: string;
}
