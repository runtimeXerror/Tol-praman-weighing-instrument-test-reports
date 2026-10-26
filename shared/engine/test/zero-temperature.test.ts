import { describe, expect, it } from "vitest";
import { loadPack } from "@tolpraman/rulepacks";
import {
  absoluteHumidity, applicableTests, ctx, evaluateTest, staticTemperaturePlan,
  t18ZeroSetting, t19StaticTemperatures, type InstrumentProfile,
} from "../src";

const OIML = loadPack("OIML").pack;
const IN = loadPack("IN").pack;

// Class III platform, e = d = 2 g -> changeover method applies (d > 0.2 e) for every reading below.
const A: InstrumentProfile = {
  cls: "III", max_g: 15000, min_g: 40, e_g: 2, d_g: 2, indication: "digital", power: "mains",
  electronic: true, liableToTilt: true, hasTare: true, maxTare_g: 5000, directSale: true,
};
const cOiml = ctx(A, OIML);
const cIn = ctx(A, IN);

describe("T18 zero-setting range (R76-1 4.5.1 / A.4.2.1)", () => {
  it("initial positive + negative portion at 18 % of Max passes; 24.67 % fails", () => {
    const ok = t18ZeroSetting(cOiml, { initial_pos_g: 1800, initial_neg_g: 900, accuracy: [] });
    expect(ok.rows[0]).toMatchObject({ kind: "initial_range", range_g: 2700, pct: 18, limit_pct: 20, verdict: "PASS" });
    const bad = t18ZeroSetting(cOiml, { initial_pos_g: 2500, initial_neg_g: 1200, accuracy: [] });
    expect(bad.rows[0]).toMatchObject({ range_g: 3700, verdict: "FAIL" });
  });

  it("initial_neg_g alone, without initial_pos_g, produces no initial-range row", () => {
    const r = t18ZeroSetting(cOiml, { initial_neg_g: 900, accuracy: [] });
    expect(r.rows.find((x) => x.kind === "initial_range")).toBeUndefined();
  });

  it("overall zero-setting + zero-tracking: 3.67 % passes, exactly 4 % passes, 4.33 % fails", () => {
    expect(t18ZeroSetting(cOiml, { overall_g: 550, accuracy: [] }).rows[0]).toMatchObject({ pct: 3.666666667, verdict: "PASS" });
    expect(t18ZeroSetting(cOiml, { overall_g: 600, accuracy: [] }).rows[0]).toMatchObject({ pct: 4, verdict: "PASS" });
    expect(t18ZeroSetting(cOiml, { overall_g: 650, accuracy: [] }).rows[0]).toMatchObject({ pct: 4.333333333, verdict: "FAIL" });
  });
});

describe("T18 zero-setting accuracy, E0 = I + 0.5 e - dL (R76-1 4.5.2)", () => {
  it("E0 exactly 0.25 e (0.5 g) passes; 0.6 g fails", () => {
    const ok = t18ZeroSetting(cOiml, { accuracy: [{ mode: "non_automatic", L: 0, I: 5, dL: 5.5 }] });
    expect(ok.rows[0]).toMatchObject({ E0: 0.5, limit: 0.5, verdict: "PASS", clause: "R76-1 4.5.2" });
    const bad = t18ZeroSetting(cOiml, { accuracy: [{ mode: "non_automatic", L: 0, I: 5, dL: 5.4 }] });
    expect(bad.rows[0]).toMatchObject({ E0: 0.6, verdict: "FAIL" });
    expect(bad.verdict).toBe("FAIL");
  });

  it("automatic zero-setting: error at about 10 e is taken as the zero error (A.4.2.3.2)", () => {
    const r = t18ZeroSetting(cOiml, { accuracy: [{ mode: "automatic", L: 20, I: 20.4, dL: 1 }] });
    expect(r.rows[0]).toMatchObject({ E0: 0.4, limit: 0.5, verdict: "PASS" });
    expect(r.notes.join(" ")).toMatch(/A\.4\.2\.3\.2/);
  });
});

describe("T18 wider initial zero-setting range (R76-1 A.4.4.2)", () => {
  const wide = { initial_pos_g: 4000, accuracy: [{ mode: "non_automatic" as const, L: 0, I: 5, dL: 5.5 }] };

  it("OIML accepts a range over 20 % only with the supplementary weighing test", () => {
    expect(t18ZeroSetting(cOiml, wide).verdict).toBe("FAIL");
    const r = t18ZeroSetting(cOiml, { ...wide, widerInitialTested: true });
    expect(r.verdict).toBe("PASS");
    expect(r.notes.join(" ")).toMatch(/A\.4\.4\.2/);
  });

  it("Heading A never allows the wider range, tested or not", () => {
    expect(t18ZeroSetting(cIn, { ...wide, widerInitialTested: true }).verdict).toBe("FAIL");
  });
});

describe("T18 class IIII overall-range exemption", () => {
  const D: InstrumentProfile = { ...A, cls: "IIII", max_g: 20000, min_g: 2000, e_g: 100, d_g: 100 };
  // overall_g = 1000 g = 5 % of Max, over the 4 % limit; accuracy reading passes on its own (E0 = 25 g = 0.25 e).
  const input = { overall_g: 1000, accuracy: [{ mode: "non_automatic" as const, L: 0, I: 100, dL: 125 }] };

  it("OIML: exempt for a non-commercial class IIII instrument", () => {
    const r = t18ZeroSetting(ctx(D, OIML), input);
    expect(r.rows[0]).toMatchObject({ kind: "overall_range", verdict: "NOT_APPLICABLE" });
    expect(r.verdict).toBe("PASS");
  });

  it("OIML: the exemption is lifted for a commercial-transaction instrument", () => {
    const r = t18ZeroSetting(ctx(D, OIML), { ...input, commercial: true });
    expect(r.rows[0].verdict).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  });

  it("Heading A: class IIII gets no exemption at all", () => {
    expect(t18ZeroSetting(ctx(D, IN), input).rows[0].verdict).toBe("FAIL");
  });
});

describe("T18 auxiliary indicating device, d < e", () => {
  // d <= 0.2 e (0.005 <= 0.01): the indication is used directly, E0 = I - L = 0.005 g.
  const E_INST: InstrumentProfile = { ...A, cls: "II", max_g: 500, min_g: 1, e_g: 0.05, d_g: 0.005 };
  const reading = { accuracy: [{ mode: "non_automatic" as const, L: 0, I: 0.005, dL: 0 }] };

  it("OIML has no separate auxiliary-device limit: 0.25 e applies and 0.005 g passes", () => {
    const r = t18ZeroSetting(ctx(E_INST, OIML), reading);
    expect(r.rows[0]).toMatchObject({ E0: 0.005, limit: 0.0125, verdict: "PASS" });
  });

  it("Heading A limits an auxiliary device to 0.5 d: 0.005 g fails against a 0.0025 g limit", () => {
    const r = t18ZeroSetting(ctx(E_INST, IN), reading);
    expect(r.rows[0]).toMatchObject({ E0: 0.005, limit: 0.0025, verdict: "FAIL" });
  });
});

describe("T18 incomplete data", () => {
  it("nothing recorded -> NOT_TESTED, with a note about the missing range", () => {
    const r = t18ZeroSetting(cOiml, { accuracy: [] });
    expect(r.verdict).toBe("NOT_TESTED");
    expect(r.notes.join(" ")).toMatch(/range/i);
  });

  it("range recorded but no accuracy reading -> still NOT_TESTED", () => {
    const r = t18ZeroSetting(cOiml, { overall_g: 300, accuracy: [] });
    expect(r.rows[0].verdict).toBe("PASS");
    expect(r.verdict).toBe("NOT_TESTED");
  });
});

it("T18 clause on the Heading A profile is prefixed 'Hdg A'", () => {
  const r = t18ZeroSetting(cIn, { overall_g: 300, accuracy: [{ mode: "non_automatic", L: 0, I: 5, dL: 5.5 }] });
  expect(r.clause).toMatch(/^Hdg A/);
  expect(r.verdict).toBe("PASS");
});

describe("absolute humidity, Magnus formula (R76-1 A.5.3.1 note)", () => {
  it("matches the standard's own reference points for the 20 g/m3 limit", () => {
    expect(absoluteHumidity(40, 39)).toBeCloseTo(20, 0);
    expect(absoluteHumidity(35, 50)).toBeCloseTo(20, 0);
    expect(absoluteHumidity(30, 66)).toBeCloseTo(20, 0);
  });

  it("0 % RH is 0 g/m3, and absolute humidity rises with RH at a fixed temperature", () => {
    expect(absoluteHumidity(25, 0)).toBe(0);
    expect(absoluteHumidity(25, 80)).toBeGreaterThan(absoluteHumidity(25, 40));
  });
});

describe("staticTemperaturePlan (R76-1 3.9.2.1)", () => {
  it("default -10/+40 range: low <= 0 C pulls in the extra 5 C test", () => {
    const plan = staticTemperaturePlan(cOiml);
    expect(plan).toMatchObject({ reference_C: 20, low_C: -10, high_C: 40 });
    expect(plan.required.map((r) => r.T_C)).toEqual([20, 40, -10, 5, 20]);
  });

  it("OIML: a low limit of 8 C (not <= 0) needs no extra 5 C test", () => {
    const H: InstrumentProfile = { ...A, tempLow_C: 8, tempHigh_C: 42 };
    expect(staticTemperaturePlan(ctx(H, OIML)).required.map((r) => r.T_C)).toEqual([20, 42, 8, 20]);
  });

  it("Heading A: the same 8 C low limit (< 10 C) still needs the extra 5 C test", () => {
    const H: InstrumentProfile = { ...A, tempLow_C: 8, tempHigh_C: 42 };
    expect(staticTemperaturePlan(ctx(H, IN)).required.map((r) => r.T_C)).toEqual([20, 42, 8, 5, 20]);
  });

  it("class I: the reference temperature is the mean of the limits", () => {
    const cl1: InstrumentProfile = { ...A, cls: "I", max_g: 200, min_g: 0.1, e_g: 0.001, d_g: 0.001, tempLow_C: 8, tempHigh_C: 40 };
    expect(staticTemperaturePlan(ctx(cl1, OIML)).reference_C).toBe(24);
  });
});

describe("T19 static temperatures, weighing at each required temperature (R76-1 3.9.2 / A.4.4.1)", () => {
  const loads = [80, 3000, 7000, 12000, 15000]; // m = 40, 1500, 3500, 6000, 7500 -> mpe = 1, 2, 3, 3, 3 g
  const dL = A.e_g / 2; // dL = 0.5 e -> E = I - L when I = L, so Ec = 0 for a clean baseline.
  const zeroRow = () => ({ L: 0, I: 0, dL });
  const rowsAt = (bump: Partial<Record<number, number>> = {}) =>
    loads.map((L) => ({ L, I: L + (bump[L] ?? 0), dL }));
  const phase = (T_C: number, extra: Record<string, unknown> = {}, bump: Partial<Record<number, number>> = {}) =>
    ({ T_C, zero: zeroRow(), rows: rowsAt(bump), ...extra });

  it("all five required temperatures within limits -> PASS", () => {
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), phase(40, { RH_pct: 25 }), phase(-10), phase(5), phase(20)] });
    expect(r.verdict).toBe("PASS");
    expect(r.rows).toHaveLength(25);
    expect(r.rows[0]).toMatchObject({ T_C: 20, mpe: 1, verdict: "PASS" });
    expect(r.rows[13]).toMatchObject({ T_C: -10, mpe: 3, Ec: 0, verdict: "PASS" }); // 3rd load of the 3rd phase
    expect(r.summary).toMatchObject({ reference_C: 20, low_C: -10, high_C: 40, required: "20, 40, -10, 5, 20" });
  });

  it("temperatures within the +/-2 C chamber tolerance still count (21.9 C for 20 C, -8.5 C for -10 C)", () => {
    const r = t19StaticTemperatures(cOiml, { phases: [phase(21.9), phase(40), phase(-8.5), phase(5), phase(20)] });
    expect(r.verdict).toBe("PASS");
  });

  it("missing the extra 5 C phase -> NOT_TESTED, note names the 5 C temperature", () => {
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), phase(40), phase(-10), phase(20)] });
    expect(r.verdict).toBe("NOT_TESTED");
    expect(r.notes.join(" ")).toMatch(/5 °C/);
  });

  it("missing the closing reference phase -> NOT_TESTED, note names it", () => {
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), phase(40), phase(-10), phase(5)] });
    expect(r.verdict).toBe("NOT_TESTED");
    expect(r.notes.join(" ")).toMatch(/reference/i);
  });

  it("a load reading 6 g off at Max (mpe 3 g) at the high temperature -> FAIL", () => {
    const hot = phase(40, {}, { 12000: 6 });
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), hot, phase(-10), phase(5), phase(20)] });
    expect(r.rows[8]).toMatchObject({ T_C: 40, L: 12000, Ec: 6, mpe: 3, verdict: "FAIL" }); // 4th load of the 2nd phase
    expect(r.verdict).toBe("FAIL");
  });

  it("only two loads recorded in a phase -> incomplete, note requires at least 5 (A.4.4.1)", () => {
    const short = { ...phase(-10), rows: rowsAt().slice(0, 2) };
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), phase(40), short, phase(5), phase(20)] });
    expect(r.notes.join(" ")).toMatch(/at least 5/);
    expect(r.verdict).toBe("NOT_TESTED");
  });

  it("OIML checks absolute humidity only at the high-temperature phase (>20 g/m3 at 40 C, 90 % RH)", () => {
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), phase(40, { RH_pct: 90 }), phase(-10), phase(5), phase(20)] });
    expect(r.verdict).toBe("NOT_TESTED");
    expect(r.notes.join(" ")).toMatch(/20 g\/m3/);
  });

  it("fewer than 5 loads is allowed as a phase with zero rows to mark it not yet done, without a spurious loads note", () => {
    const r = t19StaticTemperatures(cOiml, { phases: [phase(20), phase(40), phase(-10), phase(5)] });
    expect(r.notes.join(" ")).not.toMatch(/at least 5/);
  });
});

describe("T19: OIML vs Heading A on the required temperatures and humidity scope", () => {
  const H: InstrumentProfile = { ...A, tempLow_C: 8, tempHigh_C: 42 };
  const fourPhases = (T_C: number) =>
    ({ T_C, zero: { L: 0, I: 0, dL: 1 }, rows: [20, 100, 300, 800, 1500].map((L) => ({ L, I: L, dL: 1 })) });

  it("OIML passes with just reference/high/low/reference (no 5 C phase needed)", () => {
    const r = t19StaticTemperatures(ctx(H, OIML), { phases: [fourPhases(20), fourPhases(42), fourPhases(8), fourPhases(20)] });
    expect(r.verdict).toBe("PASS");
  });

  it("Heading A demands the extra 5 C phase (low = 8 C < 10 C) even though OIML does not", () => {
    const missing = t19StaticTemperatures(ctx(H, IN), { phases: [fourPhases(20), fourPhases(42), fourPhases(8), fourPhases(20)] });
    expect(missing.verdict).toBe("NOT_TESTED");
    expect(missing.summary?.required).toBe("20, 42, 8, 5, 20");
    const complete = t19StaticTemperatures(ctx(H, IN), { phases: [fourPhases(20), fourPhases(42), fourPhases(8), fourPhases(5), fourPhases(20)] });
    expect(complete.verdict).toBe("PASS");
  });

  it("Heading A checks absolute humidity at every phase; OIML only at the high-temperature one", () => {
    // Class I, mean-of-limits reference = 24 C, where 100 % RH crosses the 20 g/m3 limit (unlike at 20 C).
    const cl1: InstrumentProfile = { ...A, cls: "I", max_g: 200, min_g: 0.1, e_g: 0.001, d_g: 0.001, tempLow_C: 8, tempHigh_C: 40 };
    const ref = (T_C: number, RH_pct?: number) =>
      ({ T_C, RH_pct, zero: { L: 0, I: 0, dL: 0.0005 }, rows: [1, 20, 60, 120, 200].map((L) => ({ L, I: L, dL: 0.0005 })) });
    const phases = [ref(24, 100), ref(40, 30), ref(8), ref(24)];

    const oiml = t19StaticTemperatures(ctx(cl1, OIML), { phases });
    expect(oiml.verdict).toBe("PASS");
    expect(oiml.notes.join(" ")).toMatch(/barometric/i);

    const inRes = t19StaticTemperatures(ctx(cl1, IN), { phases });
    expect(inRes.verdict).toBe("NOT_TESTED");
    expect(inRes.notes.join(" ")).toMatch(/20 g\/m3/);
  });
});

it("T19: temperature limits narrower than the class minimum span are flagged (R76-1 3.9.2.2)", () => {
  const narrow: InstrumentProfile = { ...A, cls: "II", tempLow_C: 10, tempHigh_C: 20 };
  const r = t19StaticTemperatures(ctx(narrow, OIML), { phases: [] });
  expect(r.notes.join(" ")).toMatch(/at least 15 °C/);
});

describe("T18 / T19 wired into applicability and evaluation", () => {
  it("both tests apply to this instrument under both profiles", () => {
    for (const p of [OIML, IN]) {
      const app = applicableTests(A, p);
      expect(app.find((t) => t.id === "T18")?.applicable).toBe(true);
      expect(app.find((t) => t.id === "T19")?.applicable).toBe(true);
    }
  });

  it("evaluateTest dispatches T18 to a verdict and T19 to NOT_TESTED without data", () => {
    const t18 = evaluateTest("T18", A, OIML, { overall_g: 300, accuracy: [{ mode: "non_automatic", L: 0, I: 5, dL: 5.5 }] });
    expect(t18.verdict).toBe("PASS");
    expect(evaluateTest("T19", A, OIML, null).verdict).toBe("NOT_TESTED");
  });
});
