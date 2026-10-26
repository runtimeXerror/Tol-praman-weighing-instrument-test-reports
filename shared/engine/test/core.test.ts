import { describe, expect, it } from "vitest";
import { loadPack } from "@tolpraman/rulepacks";
import {
  aggregate, correctedError, decide, errorMethod, errorOf, mpe, mpeChangePoints, validateInstrument,
  type InstrumentProfile,
} from "../src";

const OIML = loadPack("OIML").pack;
const IN = loadPack("IN").pack;

const inst = (p: Partial<InstrumentProfile>): InstrumentProfile => ({
  cls: "III", max_g: 30000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains", electronic: true, ...p,
});

describe("MPE golden values (R76-1 Table 6 / Hdg A Table 20)", () => {
  const III = inst({});
  it.each([
    [2500, 2.5], [2505, 5.0], [10000, 5.0], [10005, 7.5], [30000, 7.5], [0, 2.5],
  ])("class III e=5 g, %d g -> %d g", (L, m) => {
    expect(mpe(III, L, OIML).mpe_g).toBe(m);
    expect(mpe(III, L, IN).mpe_g).toBe(m);
  });

  it.each([["IIII"], ["IV"]])("class %s e=5 g: 250 g -> 2.5, 1000 g -> 5.0", (cls) => {
    const i = inst({ cls, max_g: 5000, min_g: 50 });
    expect(mpe(i, 250, OIML).mpe_g).toBe(2.5);
    expect(mpe(i, 1000, OIML).mpe_g).toBe(5.0);
  });

  it("class I e=0.001 g: 50 g -> 0.0005", () => {
    const i = inst({ cls: "I", max_g: 220, min_g: 0.1, e_g: 0.001, d_g: 0.0001 });
    expect(mpe(i, 50, OIML).mpe_g).toBe(0.0005);
  });

  it("multi-interval class III, ranges (6000 g, e=2), (15000 g, e=5)", () => {
    const i = inst({ max_g: 15000, min_g: 40, e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }] });
    expect(mpe(i, 1000, OIML).mpe_g).toBe(1.0);
    expect(mpe(i, 5000, OIML).mpe_g).toBe(3.0);
    expect(mpe(i, 6000, OIML).mpe_g).toBe(3.0);
    expect(mpe(i, 8000, OIML).mpe_g).toBe(5.0);
    expect(mpe(i, 12000, OIML).mpe_g).toBe(7.5);
  });

  it("R76-1 3.3 worked example: Max 2/5/15 kg, e 1/2/10 g", () => {
    const i = inst({ max_g: 15000, min_g: 20, e_g: 1, d_g: 1, ranges: [{ max_g: 2000, e_g: 1 }, { max_g: 5000, e_g: 2 }, { max_g: 15000, e_g: 10 }] });
    expect(mpe(i, 500, OIML).mpe_g).toBe(0.5);
    expect(mpe(i, 501, OIML).mpe_g).toBe(1);
    expect(mpe(i, 2000, OIML).mpe_g).toBe(1);
    expect(mpe(i, 2002, OIML).mpe_g).toBe(2);
    expect(mpe(i, 4000, OIML).mpe_g).toBe(2);
    expect(mpe(i, 4002, OIML).mpe_g).toBe(3);
    expect(mpe(i, 5000, OIML).mpe_g).toBe(3);
    expect(mpe(i, 5010, OIML).mpe_g).toBe(10);
    expect(mpe(i, 15000, OIML).mpe_g).toBe(10);
    expect(validateInstrument(i, OIML).valid).toBe(true);
  });

  it("in service (inspection) = 2 x initial", () => {
    for (const L of [100, 2500, 2505, 10005, 30000]) {
      expect(mpe(inst({}), L, OIML, { inService: true }).mpe_g).toBe(2 * mpe(inst({}), L, OIML).mpe_g);
    }
  });

  describe("both sides of every band boundary, every class", () => {
    const cases: Array<[string, number, number[]]> = [
      ["I", 0.001, [50000, 200000]],
      ["II", 0.1, [5000, 20000]],
      ["III", 5, [500, 2000]],
      ["IIII", 5, [50, 200]],
    ];
    for (const [cls, e, bounds] of cases) {
      const i = inst({ cls, e_g: e, d_g: e, max_g: e * 1e6, min_g: 0 });
      const steps = [0.5, 1.0, 1.5];
      bounds.forEach((m, k) => {
        it(`class ${cls}: m = ${m} -> ${steps[k]} e, m = ${m} + 1 -> ${steps[k + 1]} e`, () => {
          expect(mpe(i, m * e, OIML).mpe_e).toBe(steps[k]);
          expect(mpe(i, (m + 1) * e, OIML).mpe_e).toBe(steps[k + 1]);
          expect(mpe(i, m * e, IN).mpe_e).toBe(steps[k]);
          expect(mpe(i, (m + 1) * e, IN).mpe_e).toBe(steps[k + 1]);
        });
      });
    }
  });

  it("mpe change points for class III e=5 g Max 30 kg", () => {
    expect(mpeChangePoints(inst({}), OIML)).toEqual([2500, 10000]);
  });

  it("carries the clause", () => {
    expect(mpe(inst({}), 1000, OIML).clause).toBe("R76-1 3.5.1 Table 6");
    expect(mpe(inst({}), 1000, IN).clause).toBe("Hdg A Pt II 3(6)(i) Table 20");
    expect(mpe(inst({}), 1000, IN, { inService: true }).clause).toContain("3(6)(ii)");
  });
});

describe("validateInstrument (Table 3 / Table 17)", () => {
  it("class III Max 30 kg e 5 g Min 100 g is valid with n = 6000", () => {
    const v = validateInstrument(inst({}), OIML);
    expect(v.valid).toBe(true);
    expect(v.n).toBe(6000);
    expect(v.minRequired_g).toBe(100);
  });
  it("e = 3 g is not of the 1/2/5 form", () => {
    const v = validateInstrument(inst({ e_g: 3, d_g: 3, max_g: 30000, min_g: 60 }), OIML);
    expect(v.valid).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("SCALE_FORM");
  });
  it("class III with e = 2 g needs n >= 100 and Min >= 20 e", () => {
    expect(validateInstrument(inst({ e_g: 2, d_g: 2, max_g: 150, min_g: 40 }), OIML).issues.map((i) => i.code)).toContain("N_MIN");
    expect(validateInstrument(inst({ e_g: 2, d_g: 2, max_g: 6000, min_g: 39 }), OIML).issues.map((i) => i.code)).toContain("MIN_CAPACITY");
  });
  it("class III with e >= 5 g needs n >= 500", () => {
    const v = validateInstrument(inst({ max_g: 2000, min_g: 100 }), OIML);
    expect(v.issues.find((i) => i.code === "N_MIN")?.clause).toBe("R76-1 3.2 Table 3");
  });
  it("n above class maximum is invalid", () => {
    expect(validateInstrument(inst({ max_g: 60000, min_g: 100 }), OIML).issues.map((i) => i.code)).toContain("N_MAX");
  });
  it("class IIII (IV) needs e >= 5 g", () => {
    const v = validateInstrument(inst({ cls: "IV", e_g: 2, d_g: 2, max_g: 1000, min_g: 20 }), IN);
    expect(v.issues.map((i) => i.code)).toContain("E_BAND");
    expect(v.classDisplay).toBe("IV");
  });
  it("class II e = 0.1 g band needs n >= 5000 and Min 50 e", () => {
    expect(validateInstrument(inst({ cls: "II", e_g: 0.1, d_g: 0.1, max_g: 400, min_g: 5 }), OIML).issues.map((i) => i.code)).toContain("N_MIN");
    expect(validateInstrument(inst({ cls: "II", e_g: 0.1, d_g: 0.1, max_g: 600, min_g: 5 }), OIML).valid).toBe(true);
    expect(validateInstrument(inst({ cls: "II", e_g: 0.1, d_g: 0.1, max_g: 600, min_g: 4 }), OIML).valid).toBe(false);
  });
  it("auxiliary indicating device only for class I/II, d < e <= 10 d", () => {
    expect(validateInstrument(inst({ d_g: 1 }), OIML).issues.map((i) => i.code)).toContain("AUX_CLASS");
    expect(validateInstrument(inst({ cls: "II", e_g: 0.01, d_g: 0.001, max_g: 200, min_g: 0.02 }), OIML).valid).toBe(true);
  });
  it("multi-interval boundary rule (Table 4): Max1/e2 >= 500 for class III", () => {
    const ok = inst({ max_g: 15000, min_g: 40, e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }] });
    expect(validateInstrument(ok, OIML).valid).toBe(true);
    const bad = inst({ max_g: 15000, min_g: 40, e_g: 2, d_g: 2, ranges: [{ max_g: 2000, e_g: 2 }, { max_g: 15000, e_g: 5 }] });
    const v = validateInstrument(bad, OIML);
    expect(v.issues.map((i) => i.code)).toContain("MI_BOUNDARY");
    expect(validateInstrument(bad, IN).issues.find((i) => i.code === "MI_BOUNDARY")?.clause).toContain("Table 18");
  });
  it("class I e < 1 mg: OIML warns, IN takes e = 1 mg", () => {
    const i = inst({ cls: "I", e_g: 0.0001, d_g: 0.0001, max_g: 100, min_g: 0.1 });
    expect(validateInstrument(i, OIML).issues.map((x) => x.code)).toContain("E_BELOW_1MG");
    expect(validateInstrument(i, IN).issues.map((x) => x.code)).toContain("E_FLOOR");
    expect(mpe(i, 10, IN).e_g).toBe(0.001);
  });
  it("unknown class is reported, not thrown", () => {
    expect(validateInstrument(inst({ cls: "V" }), OIML).valid).toBe(false);
  });
});

describe("error (R76-1 A.4.4.3)", () => {
  it("worked example: e = 5 g, L = 1000, I = 1000, dL = 1.5 -> E = +1, Ec = +0.5 with E0 = +0.5", () => {
    const E = errorOf(1000, 1.5, 1000, 5);
    expect(E).toBe(1);
    expect(correctedError(E, 0.5)).toBe(0.5);
  });
  it("direct method when no changeover data", () => {
    expect(errorOf(1000.2, null, 1000, 5)).toBe(0.2);
  });
  it("changeover required when d > 0.2 e; direct allowed when d <= 0.2 e", () => {
    expect(errorMethod(inst({}), OIML)).toBe("changeover");
    expect(errorMethod(inst({ cls: "II", e_g: 0.01, d_g: 0.001, max_g: 200, min_g: 0.02 }), OIML)).toBe("direct");
  });
});

describe("decision rules", () => {
  it("demo: class III e=5, 10 kg, Ec=4.0, U=1.2 -> CONDITIONAL (guarded)", () => {
    const m = mpe(inst({}), 10000, OIML).mpe_g;
    expect(decide(4.0, m, 1.2, "guarded")).toBe("CONDITIONAL");
    expect(decide(4.0, m, 1.2, "simple")).toBe("PASS");
  });
  it("demo: 30 kg, Ec=10.5 -> FAIL", () => {
    expect(decide(10.5, mpe(inst({}), 30000, OIML).mpe_g, 0, "guarded")).toBe("FAIL");
  });
  it("exactly at mpe is PASS; float noise does not flip it", () => {
    expect(decide(0.1 + 0.2, 0.3)).toBe("PASS");
    expect(decide(-7.5, 7.5)).toBe("PASS");
  });
  it("aggregate", () => {
    expect(aggregate(["PASS", "NOT_APPLICABLE"])).toBe("PASS");
    expect(aggregate(["PASS", "CONDITIONAL"])).toBe("CONDITIONAL");
    expect(aggregate(["CONDITIONAL", "NOT_TESTED"])).toBe("NOT_TESTED");
    expect(aggregate(["NOT_TESTED", "FAIL"])).toBe("FAIL");
    expect(aggregate([])).toBe("NOT_TESTED");
    expect(aggregate(["NOT_APPLICABLE"])).toBe("NOT_APPLICABLE");
  });
});
