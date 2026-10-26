import type { Applicability, TestDef } from "@tolpraman/rulepacks";
import { e1, normalizeClass } from "./instrument";
import { lim } from "./limits";
import type { InstrumentProfile, RulePack } from "./types";

export interface ApplicableTest {
  id: string;
  name: string;
  clause: string;
  applicable: boolean;
  reasons: string[];
}

function evalRule(a: Applicability, inst: InstrumentProfile, pack: RulePack): string[] {
  const cls = normalizeClass(String(inst.cls), pack);
  const why: string[] = [];
  const display = (c: string) => pack.accuracy_classes.find((x) => x.id === c)?.display ?? c;
  if (a.classes && !a.classes.includes(cls)) why.push(`only for classes ${a.classes.map(display).join(", ")}`);
  if (a.electronic === true && !inst.electronic) why.push("only for electronic instruments");
  if (a.indication && !a.indication.includes(inst.indication)) why.push(`only for ${a.indication.join("/")} indication`);
  if (typeof a.max_g_lte === "number" && !(inst.max_g <= a.max_g_lte)) why.push(`only for Max <= ${a.max_g_lte / 1000} kg`);
  if (a.liable_to_tilt === true && inst.liableToTilt === false) why.push("instrument not liable to be tilted");
  if (a.has_tare === true && !inst.hasTare) why.push("no tare device");
  if (a.not) {
    if (a.not.classes?.includes(cls)) why.push(`not for class ${display(cls)}`);
    if (typeof a.not.class_II_e_below_g === "number" && cls === "II" && e1(inst) < a.not.class_II_e_below_g) {
      why.push(`not for class II with e < ${a.not.class_II_e_below_g} g`);
    }
  }
  return why;
}

/** Which tests apply to this instrument under this rule pack, with the reason when not. */
export function applicableTests(inst: InstrumentProfile, pack: RulePack): ApplicableTest[] {
  return pack.tests.map((t: TestDef) => {
    const reasons = evalRule(t.applies_if ?? {}, inst, pack);
    if (t.id === "T04" && inst.indication === "digital") {
      const min = lim<any>(pack, "discrimination").digital.applies_if_d_g_gte;
      if (min !== null && inst.d_g < min - 1e-15) reasons.push(`digital discrimination only for d >= ${min * 1000} mg`);
    }
    if (t.id === "T09" && !inst.liableToTilt) reasons.push("instrument not liable to be tilted");
    return { id: t.id, name: t.name, clause: t.clause, applicable: reasons.length === 0, reasons };
  });
}
