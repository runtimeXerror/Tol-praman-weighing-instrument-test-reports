/**
 * Data-entry form specs for every R 76 test. The structure (sections, columns, default rows) is
 * derived from the rule pack's test definitions and the instrument; the engine computes results.
 */
import {
  checklistFor, ctx, testDef, eAt, eccentricityLoad, mpeChangePoints, normalizeClass, repeatabilityCount, staticTemperaturePlan, type InstrumentProfile, type RulePack,
} from "@tolpraman/engine";

export type ColType = "number" | "text" | "select" | "bool" | "yesno";

export interface Col {
  key: string;
  label: string;
  unit?: string;
  type?: ColType;
  options?: Array<{ value: string; label: string }>;
  width?: string;
  /** Column holds an indication that can be captured from the scale. */
  capture?: boolean;
  /** This column is a load L (weights picker available). */
  load?: boolean;
  placeholder?: string;
}

export type Section =
  | { type: "fields"; title?: string; fields: Col[]; path?: string }
  | { type: "zero"; title: string; path: string; hint?: string }
  | { type: "table"; title?: string; path: string; columns: Col[]; results?: "inline" | "none"; addLabel?: string; newRow?: () => Record<string, unknown> }
  | { type: "groups"; title: string; path: string; groupFields: Col[]; sections: Section[]; groupLabel: (g: any, i: number) => string };

export interface FormSpec {
  intro?: string;
  sections: Section[];
  /** Render the kernel's result rows as a separate "computed" table. */
  computedTable?: boolean;
  defaults: () => any;
}

const round = (x: number, e: number) => Math.round(x / e) * e;
const L: Col = { key: "L", label: "Load L", unit: "g", type: "number", load: true };
const I: Col = { key: "I", label: "Indication I", unit: "g", type: "number", capture: true };
const dL: Col = { key: "dL", label: "ΔL", unit: "g", type: "number" };

export function defaultLoads(inst: InstrumentProfile, pack: RulePack): number[] {
  const pts = new Set<number>([inst.min_g, ...mpeChangePoints(inst, pack), inst.max_g]);
  for (const f of [0.1, 0.2, 0.4, 0.5, 0.6, 0.8]) if (pts.size < 10) pts.add(round(inst.max_g * f, eAt(inst, inst.max_g * f)));
  return [...pts].filter((x) => x > 0).sort((a, b) => a - b);
}

export function formSpec(testId: string, inst: InstrumentProfile, pack: RulePack): FormSpec {
  const c = ctx(inst, pack);
  const e = inst.e_g;
  const half = round(inst.max_g / 2, eAt(inst, inst.max_g / 2));
  switch (testId) {
    case "T01": {
      const loads = defaultLoads(inst, pack);
      return {
        intro: "Apply loads from zero up to Max and back to zero. Include Min, loads where the mpe changes, and Max (A.4.4.1). E = I + ½e − ΔL − L; Ec = E − E0.",
        sections: [
          { type: "zero", title: "Zero reading (E0)", path: "zero", hint: "At zero or near zero (e.g. 10 e with zero-tracking)" },
          { type: "table", title: "Loading and unloading", path: "rows", results: "inline", columns: [{ key: "dir", label: "Dir.", type: "select", options: [{ value: "up", label: "↑ up" }, { value: "down", label: "↓ down" }], width: "w-24" }, L, I, dL], newRow: () => ({ dir: "up" }) },
        ],
        defaults: () => ({ zero: { L: 0 }, initial: true, rows: [...loads.map((x) => ({ dir: "up", L: x })), ...[...loads].reverse().map((x) => ({ dir: "down", L: x }))] }),
      };
    }
    case "T02":
      return {
        intro: "Zero indication at each temperature (no preloading). Change per 1 °C (class I) or per 5 °C (others) between consecutive temperatures must not exceed e1.",
        sections: [{ type: "table", title: "Temperatures", path: "rows", results: "inline", columns: [{ key: "T_C", label: "Temperature", unit: "°C", type: "number" }, { ...I, label: "Zero indication I0" }, dL] }],
        defaults: () => ({ rows: [20, inst.tempHigh_C ?? 40, inst.tempLow_C ?? -10, 5, 20].map((T) => ({ T_C: T })) }),
      };
    case "T03": {
      const ecc = eccentricityLoad(c);
      const n = inst.supports && inst.supports > 4 ? inst.supports : 4;
      return {
        intro: `Eccentricity load ${ecc.load_g} g: ${ecc.rule}. Mark positions on the sketch; automatic zero-tracking off.`,
        sections: [
          { type: "zero", title: "Zero reading (E0)", path: "zero" },
          { type: "table", title: "Positions", path: "rows", results: "inline", columns: [{ key: "position", label: "Position", type: "text", width: "w-36" }, L, I, dL], newRow: () => ({ position: "", L: round(ecc.load_g, e) }) },
        ],
        defaults: () => ({ zero: { L: 0 }, rows: Array.from({ length: n }, (_, k) => ({ position: n === 4 ? ["1 front-left", "2 front-right", "3 back-right", "4 back-left"][k] : `Support ${k + 1}`, L: round(ecc.load_g, e) })).concat(inst.receptor === "normal" ? [{ position: "5 centre", L: round(ecc.load_g, e) }] : []) }),
      };
    }
    case "T04": {
      const loads = [inst.min_g, half, inst.max_g];
      if (inst.indication === "non_self") {
        return {
          intro: "Extra load placed gently at equilibrium must produce a visible displacement.",
          sections: [{ type: "table", path: "rows", results: "inline", columns: [L, { key: "visible", label: "Visible displacement?", type: "bool" }] }],
          defaults: () => ({ rows: loads.map((x) => ({ L: x })) }),
        };
      }
      return {
        intro: inst.indication === "digital" ? "Reduce to I − d, add 1/10 d back, then add 1.4 d: indication must become I + d." : "Add extra load equal to |mpe|: displacement ≥ 0.7 × extra load.",
        sections: [{ type: "table", path: "rows", results: "inline", columns: [L, { key: "I1", label: "Indication before I1", unit: "g", type: "number", capture: true }, { key: "I2", label: "Indication after I2", unit: "g", type: "number", capture: true }] }],
        defaults: () => ({ rows: loads.map((x) => ({ L: x, I1: x })) }),
      };
    }
    case "T05":
      return {
        intro: "Extra load = |mpe| placed with slight impact; measure permanent displacement of the indicating element.",
        sections: [{ type: "table", path: "rows", results: "inline", columns: [L, { key: "displacement_mm", label: "Displacement", unit: "mm", type: "number" }] }],
        defaults: () => ({ rows: [0, inst.max_g].map((x) => ({ L: x })) }),
      };
    case "T06": {
      const n = repeatabilityCount(c);
      return {
        intro: `Two series, about 50 % and close to 100 % of Max; ${n} weighings each (A.4.10). Zero-tracking in operation.`,
        computedTable: true,
        sections: [{
          type: "groups", title: "Series", path: "series", groupLabel: (g, i) => `Series ${i + 1} · L = ${g.L ?? "?"} g`,
          groupFields: [L],
          sections: [{ type: "table", path: "readings", results: "none", columns: [I, dL] }],
        }],
        defaults: () => ({ series: [half, inst.max_g].map((x) => ({ L: x, readings: Array.from({ length: n }, () => ({})) })) }),
      };
    }
    case "T07a":
      return {
        intro: "Zero before loading; load close to Max for 30 minutes; zero after removal as soon as stable. |ΔE0| ≤ 0.5 e1.",
        computedTable: true,
        sections: [
          { type: "zero", title: "Zero before loading", path: "before" },
          { type: "zero", title: "Zero after 30 min at ~Max", path: "after" },
          ...(inst.ranges && inst.rangeKind === "multiple_range" ? [{ type: "zero" as const, title: "Zero 5 min later (multiple range)", path: "after5min" }] : []),
        ],
        defaults: () => ({ before: { L: 0 }, after: { L: 0 } }),
      };
    case "T07b":
      return {
        intro: "Load close to Max; read at 0 min and during 30 minutes (and up to 4 h if the 30-minute rule is not met). Temperature within 2 °C.",
        sections: [
          { type: "fields", fields: [{ ...L, label: "Creep load L" }] },
          { type: "table", title: "Readings over time", path: "rows", results: "inline", columns: [{ key: "t_min", label: "Time", unit: "min", type: "number", width: "w-24" }, I, dL], newRow: () => ({}) },
        ],
        defaults: () => ({ L: round(inst.max_g * 0.95, eAt(inst, inst.max_g)), rows: [0, 5, 10, 15, 20, 25, 30].map((t) => ({ t_min: t })) }),
      };
    case "T08":
      return {
        intro: "About 50 % of Max; disturb once and print immediately. Printed value within 1 e of readings over 5 s. Zero / tare: E0 ≤ 0.25 e. Five times each.",
        sections: [
          { type: "table", title: "Printing / data storage", path: "prints", results: "inline", columns: [{ key: "printed", label: "Printed value", unit: "g", type: "number" }, { key: "min", label: "Min reading 5 s", unit: "g", type: "number" }, { key: "max", label: "Max reading 5 s", unit: "g", type: "number" }] },
          { type: "table", title: "Zero-setting / tare balancing", path: "zeroTare", results: "inline", columns: [{ ...L, label: "L0" }, { ...I, label: "I0 after zero/tare" }, dL] },
        ],
        defaults: () => ({ prints: Array.from({ length: 5 }, () => ({ printed: half, min: half, max: half })), zeroTare: Array.from({ length: 5 }, () => ({ L: 0 })) }),
      };
    case "T09": {
      const Lc = mpeChangePoints(inst, pack)[0] ?? half;
      const dirs = ["ref", "forward", "backward", "left", "right"];
      return {
        intro: "Zero in reference position; then no-load and loaded readings tilted in each direction. No-load |ΔE0| ≤ 2 e; loaded |Ec| ≤ mpe.",
        sections: [
          { type: "fields", fields: [{ key: "tilt_per_mille", label: "Tilt applied", unit: "‰", type: "number" }] },
          { type: "table", path: "rows", results: "inline", columns: [{ key: "direction", label: "Direction", type: "select", width: "w-32", options: dirs.map((d) => ({ value: d, label: d === "ref" ? "Reference" : d[0].toUpperCase() + d.slice(1) })) }, L, I, dL] },
        ],
        defaults: () => ({ tilt_per_mille: inst.levelIndicator === false ? 50 : 2, rows: dirs.flatMap((d) => [{ direction: d, L: 0 }, { direction: d, L: Lc }, { direction: d, L: inst.max_g }]) }),
      };
    }
    case "T10": {
      const T = round((inst.maxTare_g ?? inst.max_g / 3) * 0.5, e);
      const net = inst.max_g - T;
      return {
        intro: "Weighing test on net loads with tare in operation (subtractive: one tare between 1/3 and 2/3 of max tare). Tare setting accuracy ≤ 0.25 e.",
        sections: [
          { type: "table", title: "Net load weighing", path: "rows", results: "inline", columns: [{ key: "tare_g", label: "Tare", unit: "g", type: "number" }, { ...L, label: "Net load L" }, I, dL] },
          { type: "table", title: "Tare setting accuracy", path: "setting", results: "inline", columns: [{ ...L, label: "L0" }, { ...I, label: "I after tare" }, dL] },
        ],
        defaults: () => ({ rows: [inst.min_g, net * 0.25, net * 0.5, net].map((x) => ({ tare_g: T, L: round(x, e) })), setting: [{ L: 0 }] }),
      };
    }
    case "T11":
      return {
        intro: "Disconnect ≥ 8 h, switch on; at 0, 5, 15 and 30 min read zero and a load close to Max. |EL − E0| ≤ |mpe|.",
        sections: [{
          type: "table", path: "rows", results: "inline", columns: [
            { key: "t_min", label: "Time", unit: "min", type: "number", width: "w-20" },
            { key: "zero.I", label: "Zero I0", unit: "g", type: "number", capture: true }, { key: "zero.dL", label: "Zero ΔL", unit: "g", type: "number" },
            { key: "loaded.L", label: "Load L", unit: "g", type: "number", load: true }, { key: "loaded.I", label: "Loaded I", unit: "g", type: "number", capture: true }, { key: "loaded.dL", label: "Loaded ΔL", unit: "g", type: "number" },
          ],
        }],
        defaults: () => ({ L: inst.max_g, rows: [0, 5, 15, 30].map((t) => ({ t_min: t, zero: { L: 0 }, loaded: { L: inst.max_g } })) }),
      };
    case "T12":
      return {
        intro: "Loads of 10 e and between ½ Max and Max at the lower and upper supply limits.",
        sections: [{ type: "table", path: "rows", results: "inline", columns: [{ key: "condition", label: "Condition", type: "text", width: "w-32" }, { key: "U_V", label: "Voltage", unit: "V", type: "number" }, L, I, dL] }],
        defaults: () => ({ rows: ["0.85 Unom", "0.85 Unom", "1.10 Unom", "1.10 Unom"].map((cond, k) => ({ condition: cond, L: k % 2 ? round(inst.max_g * 0.75, e) : 10 * e })) }),
      };
    case "T13":
      return {
        intro: "Indication with and without each disturbance; difference ≤ e, or the instrument detects and acts on a significant fault.",
        sections: [{ type: "table", path: "rows", results: "inline", columns: [{ key: "disturbance", label: "Disturbance", type: "text", width: "w-56" }, L, { key: "I_without", label: "I without", unit: "g", type: "number", capture: true }, { key: "I_with", label: "I with", unit: "g", type: "number", capture: true }, { key: "faultDetected", label: "Fault detected?", type: "bool" }] }],
        defaults: () => ({ rows: ["AC voltage dips & short interruptions", "Bursts (EFT)", "Surges", "Electrostatic discharge", "Radiated RF fields", "Conducted RF fields"].map((d) => ({ disturbance: d, L: half })) }),
      };
    case "T14": {
      const loads = defaultLoads(inst, pack).slice(0, 5);
      return {
        intro: "At least five loads: reference (20 °C, 50 % RH), high temperature at 85 % RH after 2 days, and reference again.",
        sections: [{
          type: "groups", title: "Phases", path: "phases", groupLabel: (g) => `${g.phase === "high" ? "High temperature / 85 % RH" : g.phase === "ref2" ? "Reference (after)" : "Reference (before)"} · ${g.T_C ?? "?"} °C / ${g.RH_pct ?? "?"} %`,
          groupFields: [{ key: "T_C", label: "Temperature", unit: "°C", type: "number" }, { key: "RH_pct", label: "Rel. humidity", unit: "%", type: "number" }],
          sections: [{ type: "zero", title: "Zero (E0)", path: "zero" }, { type: "table", path: "rows", results: "inline", columns: [L, I, dL] }],
        }],
        defaults: () => ({ phases: [["ref", 20, 50], ["high", inst.tempHigh_C ?? 40, 85], ["ref2", 20, 50]].map(([p, T, RH]) => ({ phase: p, T_C: T, RH_pct: RH, zero: { L: 0 }, rows: loads.map((x) => ({ L: x })) })) }),
      };
    }
    case "T15":
      return {
        intro: "At least 8 measurements near Max over up to 28 days (before, during and after other tests). |Ec| ≤ mpe; max difference ≤ max(½ e, ½ |mpe|).",
        sections: [{ type: "table", path: "rows", results: "inline", columns: [{ key: "date", label: "Date / stage", type: "text", width: "w-32" }, { key: "zero.I", label: "Zero I0", unit: "g", type: "number" }, { key: "zero.dL", label: "Zero ΔL", unit: "g", type: "number" }, L, I, dL] }],
        defaults: () => ({ rows: Array.from({ length: 8 }, (_, k) => ({ date: `Measurement ${k + 1}`, zero: { L: 0 }, L: round(inst.max_g * 0.9, e) })) }),
      };
    case "T16": {
      const loads = [inst.min_g, half, inst.max_g];
      return {
        intro: "Weighing test before, then 100 000 loadings of about 50 % Max, then weighing test after. Durability error ≤ |mpe|.",
        sections: [
          { type: "fields", fields: [{ key: "cycles", label: "Cycles completed", type: "number" }] },
          { type: "zero", title: "Before: zero", path: "before.zero" },
          { type: "table", title: "Before endurance", path: "before.rows", results: "none", columns: [L, I, dL] },
          { type: "zero", title: "After: zero", path: "after.zero" },
          { type: "table", title: "After endurance", path: "after.rows", results: "inline", columns: [L, I, dL] },
        ],
        defaults: () => ({ cycles: 100000, before: { zero: { L: 0 }, rows: loads.map((x) => ({ L: x })) }, after: { zero: { L: 0 }, rows: loads.map((x) => ({ L: x })) } }),
      };
    }
    case "T18": {
      const rules = pack.general_limits.zero_setting_range_rules ?? {};
      const iv = pack.accuracy_classes.find((k) => k.id === "IIII")?.display ?? "IIII";
      return {
        intro: "A.4.2.1: find the initial zero-setting range (switch off/on with loads; negative part with the load receptor removed) and the range of the other zero-setting and zero-tracking devices. A.4.2.3: after zero-setting, add small weights until the indication changes from 0 to e (automatic zero-setting: at about 10 e). E0 = I + ½e − ΔL − L.",
        computedTable: true,
        sections: [
          {
            type: "fields", fields: [
              { key: "initial_pos_g", label: "Initial zero-setting: positive part", unit: "g", type: "number" },
              { key: "initial_neg_g", label: "Initial zero-setting: negative part", unit: "g", type: "number" },
              { key: "overall_g", label: "Zero-setting + zero-tracking range", unit: "g", type: "number" },
              ...(rules.initial_wider_allowed_if_tested ? [{ key: "widerInitialTested", label: "Initial range > 20 %: supplementary test (A.4.4.2) done?", type: "bool" as const }] : []),
              ...(rules.class_IIII_exempt_unless_commercial && normalizeClass(String(inst.cls), pack) === "IIII" ? [{ key: "commercial", label: `Class ${iv} used for commercial transactions?`, type: "bool" as const }] : []),
            ],
          },
          { type: "table", title: "Accuracy of zero-setting", path: "accuracy", results: "none", columns: [{ key: "mode", label: "Device", type: "select", width: "w-32", options: [{ value: "non_automatic", label: "Non-/semi-auto" }, { value: "automatic", label: "Automatic / tracking" }] }, L, I, dL], newRow: () => ({ mode: "non_automatic", L: 0 }) },
        ],
        defaults: () => ({ accuracy: [{ mode: "non_automatic", L: 0, I: e }, { mode: "automatic", L: 10 * e }] }),
      };
    }
    case "T19": {
      const plan = staticTemperaturePlan(c);
      const pts = new Set<number>([inst.min_g, ...mpeChangePoints(inst, pack), inst.max_g]);
      for (const x of defaultLoads(inst, pack)) if (pts.size < 5) pts.add(x);
      const loads = [...pts].filter((x) => x > 0).sort((a, b) => a - b);
      return {
        intro: `Weighing test (A.4.4.1, at least 5 loads incl. Min, mpe change points and Max) at each temperature after 2 h at a stable temperature: ${plan.required.map((r) => `${r.T_C} °C (${r.label})`).join(" → ")}. Zero-tracking off. Heating/cooling ≤ 1 °C/min; absolute humidity ≤ 20 g/m³.`,
        sections: [{
          type: "groups", title: "Temperatures", path: "phases", groupLabel: (g, i) => `${i + 1}. ${g.label ?? "Temperature"} · ${g.T_C ?? "?"} °C${g.RH_pct != null ? ` / ${g.RH_pct} % RH` : ""}`,
          groupFields: [{ key: "T_C", label: "Temperature", unit: "°C", type: "number" }, { key: "RH_pct", label: "Rel. humidity", unit: "%", type: "number" }, ...(normalizeClass(String(inst.cls), pack) === "I" ? [{ key: "p_hPa", label: "Bar. pressure", unit: "hPa", type: "number" as const }] : [])],
          sections: [{ type: "zero", title: "Zero (E0)", path: "zero" }, { type: "table", path: "rows", results: "inline", columns: [L, I, dL] }],
        }],
        defaults: () => ({ phases: plan.required.map((r) => ({ label: r.label[0].toUpperCase() + r.label.slice(1), T_C: r.T_C, zero: { L: 0 }, rows: loads.map((x) => ({ L: x })) })) }),
      };
    }
    case "T17":
      return {
        intro: ["Examination of construction, markings, securing and software (R 76-2 sections 1–3). Items marked * are mandatory and cannot be N/A.", testDef(pack, "T17").checklist_note].filter(Boolean).join(" "),
        sections: [{ type: "table", path: "items", results: "inline", columns: [{ key: "group", label: "Area", type: "text", width: "w-40" }, { key: "label", label: "Item", type: "text", width: "min-w-72" }, { key: "clause", label: "Clause", type: "text", width: "w-36" }, { key: "value", label: "Result", type: "yesno" }, { key: "remark", label: "Remark", type: "text" }] }],
        defaults: () => ({ items: checklistFor(pack).map((i) => ({ ...i, label: i.mandatory ? `${i.label} *` : i.label, value: null })) }),
      };
    default:
      return { sections: [], defaults: () => ({}) };
  }
}

/** Which result rows belong to which input table (results are concatenated in input order). */
export function resultOffsets(testId: string, input: any): Record<string, number> {
  switch (testId) {
    case "T08": return { prints: 0, zeroTare: input?.prints?.length ?? 0 };
    case "T10": return { rows: 0, setting: input?.rows?.length ?? 0 };
    case "T14":
    case "T19": {
      const o: Record<string, number> = {};
      let k = 0;
      (input?.phases ?? []).forEach((p: any, i: number) => { o[`phases.${i}.rows`] = k; k += p.rows?.length ?? 0; });
      return o;
    }
    case "T16": return { "after.rows": 0 };
    default: return { rows: 0, items: 0 };
  }
}
