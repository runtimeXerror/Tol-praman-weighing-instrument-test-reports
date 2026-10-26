import { describe, expect, it } from "vitest";
import { changePointWarning, indicationWarning, type InstrumentProfile } from "../src";

const inst = (p: Partial<InstrumentProfile>): InstrumentProfile => ({
  cls: "III", max_g: 15000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains", electronic: true, ...p,
});

describe("typed indication must be a multiple of d (R76-1 T.3.2.2)", () => {
  const III = inst({});
  it.each([[5000], [0], [-5], [14995], [15045]])("d = 5 g: %d g is accepted", (v) => {
    expect(indicationWarning(III, v)).toBeNull();
  });
  it.each([[5001], [5002.5], [-3], [10.05]])("d = 5 g: %d g is flagged", (v) => {
    const w = indicationWarning(III, v)!;
    expect(w.code).toBe("OFF_STEP");
    expect(w.clause).toBe("R76-1 T.3.2.2");
  });
  it("decimal d: 0.1 g steps with float noise", () => {
    const II = inst({ cls: "II", max_g: 600, min_g: 2, e_g: 0.1, d_g: 0.1 });
    expect(indicationWarning(II, 0.3)).toBeNull();
    expect(indicationWarning(II, 123.4)).toBeNull();
    expect(indicationWarning(II, 123.45)?.code).toBe("OFF_STEP");
  });
  it("d < e: multiples of d are fine", () => {
    const II = inst({ cls: "II", max_g: 600, min_g: 2, e_g: 0.1, d_g: 0.01 });
    expect(indicationWarning(II, 123.45)).toBeNull();
    expect(indicationWarning(II, 123.455)?.code).toBe("OFF_STEP");
  });
  it("multi-interval 2 g / 5 g: 5 g steps in the upper range are accepted", () => {
    const mi = inst({ max_g: 15000, e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }] });
    expect(indicationWarning(mi, 4002)).toBeNull();
    expect(indicationWarning(mi, 10005)).toBeNull();
    expect(indicationWarning(mi, 10003)?.code).toBe("OFF_STEP");
  });
  it("empty or non-numeric input gives no warning", () => {
    expect(indicationWarning(inst({}), undefined)).toBeNull();
    expect(indicationWarning(inst({}), "")).toBeNull();
  });
});

describe("change-point load ΔL lies between 0 and e (R76-1 A.4.4.3)", () => {
  const III = inst({});
  it.each([[0], [0.5], [2.5], [5]])("e = 5 g: ΔL = %d g is accepted", (dL) => {
    expect(changePointWarning(III, dL, 5000)).toBeNull();
  });
  it.each([[5.5], [50], [-0.5]])("e = 5 g: ΔL = %d g is flagged", (dL) => {
    const w = changePointWarning(III, dL, 5000)!;
    expect(w.code).toBe("DL_RANGE");
    expect(w.clause).toBe("R76-1 A.4.4.3");
  });
  it("multi-interval: e of the range holding L", () => {
    const mi = inst({ e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }] });
    expect(changePointWarning(mi, 4, 2000)?.code).toBe("DL_RANGE");
    expect(changePointWarning(mi, 4, 10000)).toBeNull();
    expect(changePointWarning(mi, 4)).toBeNull(); // L unknown: largest e
  });
  it("float noise at the boundary is not flagged", () => {
    expect(changePointWarning(inst({ e_g: 0.1, d_g: 0.1, max_g: 600, cls: "II" }), 0.1 + 0.2 - 0.2, 100)).toBeNull();
  });
});
