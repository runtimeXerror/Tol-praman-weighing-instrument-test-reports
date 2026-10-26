import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { loadPack } from "@tolpraman/rulepacks";
import {
  applicableTests, budget, checkThirdMpe, chooseWeights, checklistFor, ctx, DEFAULT_CHECKLIST, discriminationExtraLoad, eccentricityLoad,
  evaluateCase, evaluateTest, mpe, repeatabilityCount, sensitivityRequired_mm, t01Weighing, t02TempNoLoad, t03Eccentricity,
  t04Discrimination, t05Sensitivity, t06Repeatability, t07aZeroReturn, t07bCreep, t08Stability, t09Tilting, t10Tare, t11WarmUp,
  t12Power, t13Disturbances, t14DampHeat, t15SpanStability, t16Endurance, t17Checklist, type InstrumentProfile, type WeightItem,
} from "../src";

const OIML = loadPack("OIML").pack;
const IN = loadPack("IN").pack;
const XYZ30: InstrumentProfile = {
  cls: "III", max_g: 30000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains",
  electronic: true, liableToTilt: true, hasTare: true, maxTare_g: 15000, directSale: true,
};
const c = ctx(XYZ30, OIML);

describe("T01 weighing", () => {
  const loads = [100, 500, 1000, 2500, 5000, 10000, 15000, 20000, 25000, 30000];
  it("all within mpe -> PASS; E0 applied", () => {
    const r = t01Weighing(c, { zero: { L: 0, I: 0, dL: 2 }, rows: loads.map((L) => ({ L, I: L, dL: 2, dir: "up" as const })) });
    expect(r.verdict).toBe("PASS");
    expect(r.rows[0].E0).toBe(0.5);
    expect(r.rows[0].Ec).toBe(0);
    expect(r.clause).toBe("R76-1 3.5 / A.4.4");
  });
  it("one row over mpe -> FAIL", () => {
    const rows = loads.map((L) => ({ L, I: L, dL: 2.5 }));
    rows[9] = { L: 30000, I: 30010, dL: 2.5 };
    const r = t01Weighing(c, { rows });
    expect(r.rows[9].Ec).toBe(10);
    expect(r.rows[9].verdict).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  });
  it("fewer than 10 loads -> NOT_TESTED with note", () => {
    const r = t01Weighing(c, { rows: [{ L: 30000, I: 30000, dL: 2.5 }] });
    expect(r.verdict).toBe("NOT_TESTED");
    expect(r.notes.join(" ")).toMatch(/at least 10/);
  });
  it("guarded rule with uncertainty gives CONDITIONAL", () => {
    const cg = ctx(XYZ30, OIML, { rule: "guarded", uncertainty: () => 1.2 });
    const r = t01Weighing(cg, { rows: loads.map((L) => ({ L, I: L === 10000 ? 10004 : L, dL: 2.5 })) });
    expect(r.rows.find((x) => x.L === 10000)!.verdict).toBe("CONDITIONAL");
    expect(r.verdict).toBe("CONDITIONAL");
  });
});

describe("T02 temperature no-load", () => {
  it("change per 5 C within 1 e", () => {
    const r = t02TempNoLoad(c, { rows: [{ T_C: 20, I: 0, dL: 2.5 }, { T_C: 40, I: 0, dL: 0 }, { T_C: -10, I: 0, dL: 2.5 }] });
    expect(r.rows[1].changePerStep).toBe(0.625);
    expect(r.verdict).toBe("PASS");
  });
  it("too large change fails", () => {
    const r = t02TempNoLoad(c, { rows: [{ T_C: 20, I: 0, dL: 2.5 }, { T_C: 25, I: 10, dL: 2.5 }] });
    expect(r.verdict).toBe("FAIL");
  });
  it("class I uses per 1 C", () => {
    const i = ctx({ ...XYZ30, cls: "I", e_g: 0.001, d_g: 0.001, max_g: 100, min_g: 0.1 }, OIML);
    const r = t02TempNoLoad(i, { rows: [{ T_C: 20, I: 0, dL: 0.0005 }, { T_C: 22, I: 0.001, dL: 0.0005 }] });
    expect(r.rows[1].changePerStep).toBe(0.0005);
    expect(r.verdict).toBe("PASS");
  });
});

describe("T03 eccentricity", () => {
  it("load = 1/3 (Max + T+)", () => {
    expect(eccentricityLoad(c).load_g).toBe(10000);
    expect(eccentricityLoad(ctx({ ...XYZ30, maxAdditiveTare_g: 3000 }, OIML)).load_g).toBe(11000);
    expect(eccentricityLoad(ctx({ ...XYZ30, supports: 6 }, OIML)).load_g).toBe(6000);
  });
  it("positions evaluated against mpe at load", () => {
    const rows = ["1", "2", "3", "4"].map((p, k) => ({ position: p, L: 10000, I: 10000 + (k === 3 ? 10 : 0), dL: 2.5 }));
    const r = t03Eccentricity(c, { rows });
    expect(r.rows.map((x) => x.verdict)).toEqual(["PASS", "PASS", "PASS", "FAIL"]);
  });
});

describe("T04 discrimination", () => {
  it("digital: extra 1.4 d, change >= d", () => {
    expect(discriminationExtraLoad(c, 15000).extra_g).toBe(7);
    const r = t04Discrimination(c, { rows: [{ L: 100, I1: 100, I2: 105 }, { L: 15000, I1: 15000, I2: 15000 }] });
    expect(r.rows.map((x) => x.verdict)).toEqual(["PASS", "FAIL"]);
  });
  it("digital d < 5 mg: not applicable in OIML, applicable in IN", () => {
    const fine = { ...XYZ30, cls: "I", e_g: 0.001, d_g: 0.001, max_g: 100, min_g: 0.1 };
    expect(t04Discrimination(ctx(fine, OIML), { rows: [] }).verdict).toBe("NOT_APPLICABLE");
    expect(applicableTests(fine, OIML).find((t) => t.id === "T04")!.applicable).toBe(false);
    expect(applicableTests(fine, IN).find((t) => t.id === "T04")!.applicable).toBe(true);
  });
  it("non-self: 0.4 mpe OIML vs 1.0 mpe IN", () => {
    const ns = { ...XYZ30, indication: "non_self" as const, electronic: false };
    expect(discriminationExtraLoad(ctx(ns, OIML), 30000).extra_g).toBe(3);
    expect(discriminationExtraLoad(ctx(ns, IN), 30000).extra_g).toBe(7.5);
  });
  it("analog: displacement >= 0.7 x extra", () => {
    const an = ctx({ ...XYZ30, indication: "analog" as const }, OIML);
    const r = t04Discrimination(an, { rows: [{ L: 30000, I1: 30000, I2: 30005.25 }, { L: 30000, I1: 30000, I2: 30005 }] });
    expect(r.rows[0].required).toBe(5.25);
    expect(r.rows.map((x) => x.verdict)).toEqual(["PASS", "FAIL"]);
  });
});

describe("T05 sensitivity", () => {
  it("required mm by class and Max", () => {
    const ns = (p: Partial<InstrumentProfile>) => ctx({ ...XYZ30, indication: "non_self", ...p }, OIML);
    expect(sensitivityRequired_mm(ns({ cls: "II", e_g: 0.1, d_g: 0.1, max_g: 1000 }))).toBe(1);
    expect(sensitivityRequired_mm(ns({ max_g: 30000 }))).toBe(2);
    expect(sensitivityRequired_mm(ns({ max_g: 60000, e_g: 10, d_g: 10 }))).toBe(5);
    expect(t05Sensitivity(ns({}), { rows: [{ L: 0, displacement_mm: 2 }, { L: 30000, displacement_mm: 1.9 }] }).rows.map((r) => r.verdict)).toEqual(["PASS", "FAIL"]);
  });
  it("not applicable to self-indicating", () => {
    expect(t05Sensitivity(c, { rows: [] }).verdict).toBe("NOT_APPLICABLE");
  });
});

describe("T06 repeatability", () => {
  it("10 readings when Max < 1000 kg; >= 3 otherwise", () => {
    expect(repeatabilityCount(c)).toBe(10);
    expect(repeatabilityCount(ctx({ ...XYZ30, max_g: 3_000_000, e_g: 500, d_g: 500, min_g: 10000 }, OIML))).toBe(3);
  });
  it("spread <= mpe and each |E| <= mpe", () => {
    const ok = t06Repeatability(c, { series: [{ L: 15000, readings: Array.from({ length: 10 }, (_, k) => ({ I: 15000, dL: k % 2 ? 2 : 3 })) }] });
    expect(ok.verdict).toBe("PASS");
    expect(ok.rows[0].spread).toBe(1);
    const bad = t06Repeatability(c, { series: [{ L: 15000, readings: Array.from({ length: 10 }, (_, k) => ({ I: k === 0 ? 15010 : 15000, dL: 2.5 })) }] });
    expect(bad.verdict).toBe("FAIL");
  });
  it("incomplete series is NOT_TESTED", () => {
    expect(t06Repeatability(c, { series: [{ L: 15000, readings: [{ I: 15000, dL: 2.5 }] }] }).verdict).toBe("NOT_TESTED");
  });
});

describe("T07 time dependence", () => {
  it("return to zero <= 0.5 e", () => {
    expect(t07aZeroReturn(c, { before: { I: 0, dL: 2.5 }, after: { I: 0, dL: 0.5 } }).verdict).toBe("PASS");
    expect(t07aZeroReturn(c, { before: { I: 0, dL: 2.5 }, after: { I: 0, dL: 0 } }).verdict).toBe("PASS");
    expect(t07aZeroReturn(c, { before: { I: 0, dL: 3 }, after: { I: 0, dL: 0 } }).verdict).toBe("FAIL");
  });
  it("creep 30-min rule passes", () => {
    const r = t07bCreep(c, { L: 30000, rows: [0, 5, 15, 30].map((t) => ({ t_min: t, I: 30000, dL: t === 30 ? 1 : 2 })) });
    expect(r.verdict).toBe("PASS");
    expect(r.summary!.conditionA).toBe(true);
  });
  it("creep 30-min rule fails, needs 4 h; 4-h rule passes", () => {
    const short = [0, 15, 30].map((t) => ({ t_min: t, I: 30000, dL: t === 30 ? 0 : 4 }));
    expect(t07bCreep(c, { L: 30000, rows: short }).verdict).toBe("NOT_TESTED");
    const long = [...short, { t_min: 240, I: 30000, dL: 0 }];
    expect(t07bCreep(c, { L: 30000, rows: long }).verdict).toBe("PASS");
    const bad = [...short, { t_min: 240, I: 30010, dL: 0 }];
    expect(t07bCreep(c, { L: 30000, rows: bad }).verdict).toBe("FAIL");
  });
  it("time tests: OIML classes II/III/IIII, IN gazette classes I/II/III", () => {
    const iv = { ...XYZ30, cls: "IIII", max_g: 5000, min_g: 50 };
    expect(applicableTests(iv, OIML).find((t) => t.id === "T07b")!.applicable).toBe(true);
    expect(applicableTests(iv, IN).find((t) => t.id === "T07b")!.applicable).toBe(false);
  });
});

describe("T08 stability of equilibrium", () => {
  it("print within 1 e, zero/tare within 0.25 e", () => {
    const r = t08Stability(c, { prints: [{ printed: 15000, min: 14995, max: 15000 }, { printed: 15000, min: 14990, max: 15000 }], zeroTare: [{ L: 0, I: 0, dL: 2.5 }, { L: 0, I: 0, dL: 1 }] });
    expect(r.rows.map((x) => x.verdict)).toEqual(["PASS", "FAIL", "PASS", "FAIL"]);
  });
});

describe("T09 tilting", () => {
  const rows = [
    { direction: "ref", L: 0, I: 0, dL: 2.5 }, { direction: "ref", L: 30000, I: 30000, dL: 2.5 },
    { direction: "forward", L: 0, I: 5, dL: 0 }, { direction: "forward", L: 30000, I: 30005, dL: 0 },
    { direction: "back", L: 0, I: 10, dL: 0 },
  ];
  it("no-load 2 e and loaded mpe", () => {
    const r = t09Tilting(c, { rows });
    expect(r.rows[2].change).toBe(7.5);
    expect(r.rows[2].verdict).toBe("PASS");
    expect(r.rows[3].Ec).toBe(0);
    expect(r.rows[4].verdict).toBe("FAIL");
  });
  it("class II no-load limit: OIML applies for direct sale, IN never", () => {
    const ii = { ...XYZ30, cls: "II", e_g: 1, d_g: 1, max_g: 6000, min_g: 50, directSale: true };
    expect(t09Tilting(ctx(ii, OIML), { rows }).rows[4].verdict).not.toBe("NOT_APPLICABLE");
    expect(t09Tilting(ctx(ii, IN), { rows }).rows[4].verdict).toBe("NOT_APPLICABLE");
  });
});

describe("T10 tare, T12 power, T13 disturbance, T14 damp heat", () => {
  it("tare net load vs mpe, tare setting 0.25 e", () => {
    const r = t10Tare(c, { rows: [{ tare_g: 10000, L: 20000, I: 20000, dL: 2.5, zero: { L: 0, I: 0, dL: 2.5 } }], setting: [{ L: 0, I: 0, dL: 2.5 }] });
    expect(r.verdict).toBe("PASS");
  });
  it("power supply rows", () => {
    const r = t12Power(c, { rows: [{ condition: "0.85 Unom", U_V: 195.5, L: 20000, I: 20005, dL: 2.5 }] });
    expect(r.rows[0].Ec).toBe(5);
    expect(r.verdict).toBe("PASS");
  });
  it("disturbance > e fails unless fault detected", () => {
    const r = t13Disturbances(c, { rows: [{ disturbance: "ESD", L: 10000, I_without: 10000, I_with: 10005 }, { disturbance: "Burst", L: 10000, I_without: 10000, I_with: 10010 }, { disturbance: "Surge", L: 10000, faultDetected: true }] });
    expect(r.rows.map((x) => x.verdict)).toEqual(["PASS", "FAIL", "PASS"]);
  });
  it("damp heat three phases, not applicable to class II e < 1 g", () => {
    const ph = (phase: string) => ({ phase, rows: [100, 2500, 10000, 20000, 30000].map((L) => ({ L, I: L, dL: 2.5 })) });
    expect(t14DampHeat(c, { phases: [ph("ref"), ph("high"), ph("ref2")] }).verdict).toBe("PASS");
    const ii = { ...XYZ30, cls: "II", e_g: 0.1, d_g: 0.1, max_g: 600, min_g: 5 };
    expect(evaluateTest("T14", ii, OIML, { phases: [] }).verdict).toBe("NOT_APPLICABLE");
  });
});

describe("T11 warm-up, T15 span stability, T16 endurance, T17 checklist", () => {
  it("warm-up |EL - E0| <= mpe at 0/5/15/30", () => {
    const rows = [0, 5, 15, 30].map((t) => ({ t_min: t, zero: { L: 0, I: 0, dL: 2.5 }, loaded: { L: 30000, I: 30005, dL: 2.5 } }));
    expect(t11WarmUp(c, { rows }).verdict).toBe("PASS");
    expect(t11WarmUp(c, { rows: rows.slice(0, 2) }).verdict).toBe("NOT_TESTED");
  });
  it("span stability spread <= max(0.5 e, 0.5 mpe)", () => {
    const rows = Array.from({ length: 8 }, (_, k) => ({ L: 30000, I: 30000, dL: k === 3 ? 0 : 2.5 }));
    const r = t15SpanStability(c, { rows });
    expect(r.summary!.spreadLimit_g).toBe(3.75);
    expect(r.verdict).toBe("PASS");
    rows[4] = { L: 30000, I: 30005, dL: 2.5 };
    expect(t15SpanStability(c, { rows }).verdict).toBe("FAIL");
  });
  it("endurance: durability error vs mpe; not applicable above 100 kg", () => {
    const set = (d: number) => ({ rows: [15000, 30000].map((L) => ({ L, I: L, dL: d })) });
    expect(t16Endurance(c, { before: set(2.5), after: set(0) }).verdict).toBe("PASS");
    expect(applicableTests({ ...XYZ30, max_g: 150000, e_g: 50, d_g: 50, min_g: 1000 }, OIML).find((t) => t.id === "T16")!.applicable).toBe(false);
  });
  it("checklist", () => {
    const items = checklistFor(OIML).map((i) => ({ ...i, value: "yes" as const }));
    expect(t17Checklist(c, { items }).verdict).toBe("PASS");
    items[0].value = "no" as any;
    expect(t17Checklist(c, { items }).verdict).toBe("FAIL");
  });

  describe("T17 checklist comes from the rule pack (incl. R76-1 Annex G software items)", () => {
    const all = (v: (i: any) => "yes" | "no" | "na" | null) => checklistFor(OIML).map((i) => ({ ...i, value: v(i) }));
    const embedded = (i: any) => (/^(Software: PC|Data storage)/.test(i.group ?? "") ? "na" as const : "yes" as const);

    it("both profiles carry the same items; software items cite Annex G", () => {
      const ids = checklistFor(OIML).map((i) => i.id);
      expect(checklistFor(IN).map((i) => i.id)).toEqual(ids);
      expect(new Set(ids).size).toBe(ids.length);
      for (const i of checklistFor(OIML).filter((x) => x.group?.startsWith("Software") || x.group?.startsWith("Data storage"))) expect(i.clause).toMatch(/5\.5|G\./);
      expect(checklistFor(OIML).filter((i) => i.group?.startsWith("Software")).length).toBeGreaterThanOrEqual(9);
    });

    it("embedded-software instrument: G.1 yes, PC and storage groups N/A -> PASS", () => {
      expect(t17Checklist(c, { items: all(embedded) }).verdict).toBe("PASS");
    });

    it("any 'no' in a software item fails", () => {
      const items = all(embedded);
      items.find((i) => i.id === "sw_id")!.value = "no";
      const r = t17Checklist(c, { items });
      expect(r.verdict).toBe("FAIL");
      expect(r.rows.find((x: any) => x.id === "sw_id")!.clause).toMatch(/G\.1/);
    });

    it("mandatory items cannot be N/A, even if the form claims they are optional", () => {
      const items = all(embedded).map((i) => (i.id === "markings" ? { ...i, mandatory: false, value: "na" as const } : i));
      expect(t17Checklist(c, { items }).verdict).toBe("FAIL");
    });

    it("label and clause are taken from the pack, not from the form", () => {
      const items = all(embedded).map((i) => (i.id === "sealing" ? { ...i, label: "edited", clause: "none" } : i));
      const row: any = t17Checklist(c, { items }).rows.find((x: any) => x.id === "sealing");
      expect(row.label).not.toBe("edited");
      expect(row.clause).toBe("R76-1 4.1.2.4 / 7.2");
    });

    it("a mandatory item removed from the form is reported and blocks PASS", () => {
      const items = all(embedded).filter((i) => i.id !== "doc");
      const r = t17Checklist(c, { items });
      expect(r.verdict).toBe("NOT_TESTED");
      expect(r.notes.join(" ")).toMatch(/Documentation/);
    });

    it("packs without a checklist fall back to the legacy list", () => {
      const old = { ...OIML, tests: OIML.tests.map((t) => (t.id === "T17" ? { ...t, checklist: undefined } : t)) } as any;
      expect(checklistFor(old).map((i) => i.id)).toEqual(DEFAULT_CHECKLIST.map((i) => i.id));
    });
  });
});

describe("applicability and case evaluation", () => {
  it("lists every pack test with reasons", () => {
    const a = applicableTests(XYZ30, OIML);
    expect(a).toHaveLength(OIML.tests.length);
    expect(a.find((t) => t.id === "T05")!.reasons[0]).toMatch(/non_self/);
  });
  it("evaluateCase: missing inputs -> NOT_TESTED, overall worst", () => {
    const ev = evaluateCase(XYZ30, OIML, {});
    expect(ev.verdict).toBe("NOT_TESTED");
    expect(ev.counts.NOT_APPLICABLE).toBeGreaterThan(0);
  });
});

describe("weights and uncertainty", () => {
  const today = new Date("2026-09-25");
  const inv: WeightItem[] = [
    { id: "W20a", nominal_g: 20000, class: "M1", conventional_mass_g: 20000.4, U_g: 0.3, cal_due: "2027-03-01" },
    { id: "W20b", nominal_g: 20000, class: "F2", conventional_mass_g: 20000.1, U_g: 0.1, cal_due: "2027-03-01" },
    { id: "W10a", nominal_g: 10000, class: "M1", conventional_mass_g: 10000.2, U_g: 0.2, cal_due: "2027-03-01" },
    { id: "W10x", nominal_g: 10000, class: "F1", conventional_mass_g: 10000.01, U_g: 0.02, cal_due: "2025-01-01" },
    { id: "W5", nominal_g: 5000, class: "M1", conventional_mass_g: 5000.1, U_g: 0.1, cal_due: "2027-03-01" },
    { id: "W5b", nominal_g: 5000, class: "M1", conventional_mass_g: 5000.05, U_g: 0.1, cal_due: "2027-03-01" },
  ];
  it("minimum set, lowest U, expired weight rejected, L = conventional mass", () => {
    const s = chooseWeights(30000, inv, today);
    expect(s.ok).toBe(true);
    expect(s.items.map((w) => w.id).sort()).toEqual(["W10a", "W20b"]);
    expect(s.conventional_g).toBe(30000.3);
    expect(s.items.some((w) => w.id === "W10x")).toBe(false);
  });
  it("impossible target reports blocked weights", () => {
    const s = chooseWeights(1, inv, today);
    expect(s.ok).toBe(false);
    expect(s.message).toMatch(/expired/);
  });
  it("1/3 mpe check blocks bad weights", () => {
    const good = checkThirdMpe(30000, [inv[1], inv[2]], XYZ30, OIML);
    expect(good.limit_g).toBe(2.5);
    expect(good.ok).toBe(true);
    const bad = checkThirdMpe(100, [{ ...inv[4], nominal_g: 100, conventional_mass_g: 101 }], XYZ30, OIML);
    expect(bad.ok).toBe(false);
  });
  it("budget U = 2 u_c", () => {
    const b = budget(XYZ30, 10000, OIML, { u_weight: 0.1, u_rep: 0.5 });
    expect(b.u_res).toBeCloseTo(0.288675, 5);
    expect(b.U).toBeCloseTo(2 * Math.sqrt(0.01 + 0.0833333 + 0.25), 4);
  });
});

describe("properties", () => {
  it("MPE is non-decreasing with load inside a range", () => {
    fc.assert(fc.property(fc.constantFrom("I", "II", "III", "IIII"), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (cls, a, b) => {
      const e = cls === "I" ? 0.001 : cls === "II" ? 0.1 : 5;
      const i = { ...XYZ30, cls, e_g: e, d_g: e, max_g: e * 100000 };
      const [x, y] = [Math.min(a, b), Math.max(a, b)].map((v) => v * i.max_g);
      return mpe(i, x, OIML).mpe_g <= mpe(i, y, OIML).mpe_g;
    }));
  });
  it("verdict is never PASS when |Ec| > mpe", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30000 }), fc.double({ min: -20, max: 20, noNaN: true }), (L, err) => {
      const r = t01Weighing(c, { rows: [{ L, I: L + err }] });
      const row = r.rows[0];
      return Math.abs(row.Ec as number) <= (row.mpe as number) + 1e-9 || row.verdict === "FAIL";
    }));
  });
  it("multi-interval MPE is non-decreasing across partial ranges", () => {
    const i = { ...XYZ30, max_g: 15000, min_g: 40, e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }] };
    fc.assert(fc.property(fc.integer({ min: 0, max: 15000 }), fc.integer({ min: 0, max: 15000 }), (a, b) => {
      const [x, y] = [Math.min(a, b), Math.max(a, b)];
      return mpe(i, x, OIML).mpe_g <= mpe(i, y, OIML).mpe_g;
    }));
  });
});
