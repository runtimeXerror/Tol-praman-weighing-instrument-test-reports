/**
 * Exhaustive grid tests. Every expected value comes from an independent reference written here
 * directly from the standard's tables (OIML R 76-1 Tables 3 & 6 / LM (G) Rules Hdg A Tables 17 & 20),
 * NOT from the rule packs, so a wrong number in a pack is caught.
 */
import { describe, expect, it } from "vitest";
import { loadPack } from "@tolpraman/rulepacks";
import {
  chooseWeights, ctx, decide, discriminationExtraLoad, errorOf, isScaleIntervalForm, mpe, sensitivityRequired_mm, validateInstrument,
  type InstrumentProfile, type WeightItem,
} from "../src";

const PACKS = { OIML: loadPack("OIML").pack, IN: loadPack("IN").pack };
type Cls = "I" | "II" | "III" | "IIII";

// ---------- Reference: R 76-1 Table 6 / Hdg A Table 20 (band upper limits in e, inclusive) ----------
const TABLE6: Record<Cls, Array<[number, number]>> = {
  I: [[50000, 0.5], [200000, 1.0], [Infinity, 1.5]],
  II: [[5000, 0.5], [20000, 1.0], [100000, 1.5]],
  III: [[500, 0.5], [2000, 1.0], [10000, 1.5]],
  IIII: [[50, 0.5], [200, 1.0], [1000, 1.5]],
};
const refMpeE = (cls: Cls, m: number) => (TABLE6[cls].find(([hi]) => m <= hi) ?? TABLE6[cls][TABLE6[cls].length - 1])[1];

// ---------- Reference: R 76-1 Table 3 / Hdg A Table 17 ----------
interface Band { eMin: number; eMax: number; nMin: number; nMax: number; k: number }
const TABLE3: Record<Cls, Band[]> = {
  I: [{ eMin: 0.001, eMax: Infinity, nMin: 50000, nMax: Infinity, k: 100 }],
  II: [{ eMin: 0.001, eMax: 0.05, nMin: 100, nMax: 100000, k: 20 }, { eMin: 0.1, eMax: Infinity, nMin: 5000, nMax: 100000, k: 50 }],
  III: [{ eMin: 0.1, eMax: 2, nMin: 100, nMax: 10000, k: 20 }, { eMin: 5, eMax: Infinity, nMin: 500, nMax: 10000, k: 20 }],
  IIII: [{ eMin: 5, eMax: Infinity, nMin: 100, nMax: 1000, k: 10 }],
};
const bandOf = (cls: Cls, e: number) => TABLE3[cls].find((b) => e >= b.eMin - 1e-12 && e <= b.eMax + 1e-12);

/** Allowed e values (1-2-5 series) per class, from the Table 3 bands. */
const E_VALUES: Record<Cls, number[]> = {
  I: [0.001, 0.002, 0.005],
  II: [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  III: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500],
  IIII: [5, 10, 20, 50, 100],
};
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const inst = (cls: Cls, e: number, max: number, min: number): InstrumentProfile => ({
  cls, e_g: e, d_g: e, max_g: r9(max), min_g: r9(min), indication: "digital", power: "mains", electronic: true,
});

// ================= 1. MPE: both sides of every band edge, every class, every e, both profiles =================
describe("MPE grid vs Table 6 / Table 20", () => {
  const rows: Array<[string, Cls, number, number, number]> = [];
  for (const cls of Object.keys(TABLE6) as Cls[]) {
    for (const e of E_VALUES[cls]) {
      const edges = TABLE6[cls].map(([hi]) => hi).filter(Number.isFinite);
      const ms = [0, 1, ...edges.flatMap((m) => [m, m + 1])];
      for (const m of ms) for (const profile of ["OIML", "IN"]) rows.push([profile, cls, e, m, r9(refMpeE(cls, m) * e)]);
    }
  }
  it.each(rows)("%s class %s, e = %s g, m = %s e -> mpe %s g", (profile, cls, e, m, expected) => {
    const i = inst(cls, e, e * 1e6, 0);
    expect(mpe(i, r9(m * e), PACKS[profile as "OIML" | "IN"]).mpe_g).toBeCloseTo(expected, 9);
  });

  const svc: Array<[Cls, number, number]> = [];
  for (const cls of Object.keys(TABLE6) as Cls[]) for (const [hi] of TABLE6[cls].filter(([h]) => Number.isFinite(h))) svc.push([cls, E_VALUES[cls][0], hi]);
  it.each(svc)("in-service (inspection) mpe = 2 x initial: class %s, e %s g, m %s e", (cls, e, m) => {
    const i = inst(cls, e, e * 1e6, 0);
    for (const p of Object.values(PACKS)) expect(mpe(i, m * e, p, { inService: true }).mpe_g).toBeCloseTo(2 * refMpeE(cls, m) * e, 9);
  });
});

// ================= 2. Instrument validation vs Table 3 / Table 17 =================
describe("validateInstrument grid vs Table 3 / Table 17", () => {
  const rows: Array<[string, Cls, number, number, string, boolean]> = [];
  for (const cls of Object.keys(TABLE3) as Cls[]) {
    for (const e of E_VALUES[cls]) {
      const b = bandOf(cls, e)!;
      const ns = [b.nMin - 1, b.nMin, Math.round((b.nMin + Math.min(b.nMax, b.nMin * 4)) / 2), ...(Number.isFinite(b.nMax) ? [b.nMax, b.nMax + 1] : [])];
      for (const n of ns) {
        for (const [minLabel, min] of [["Min = k e", b.k * e], ["Min < k e", (b.k - 1) * e]] as const) {
          const expected = n >= b.nMin && n <= b.nMax && min >= b.k * e - 1e-12;
          rows.push([`${n}`, cls, e, min, minLabel, expected]);
        }
      }
    }
  }
  it.each(rows)("n = %s, class %s, e = %s g, Min %s g (%s) -> valid %s", (n, cls, e, min, _l, expected) => {
    const v = validateInstrument(inst(cls, e, Number(n) * e, min), PACKS.OIML);
    expect(v.valid).toBe(expected);
    const vi = validateInstrument(inst(cls, e, Number(n) * e, min), PACKS.IN);
    expect(vi.valid).toBe(expected);
  });

  const wrongBand: Array<[Cls, number]> = [["III", 0.05], ["IIII", 2], ["IIII", 1], ["III", 0.01]];
  it.each(wrongBand)("class %s with e = %s g is outside every Table 3 band", (cls, e) => {
    expect(validateInstrument(inst(cls, e, e * 1000, e * 100), PACKS.OIML).issues.map((i) => i.code)).toContain("E_BAND");
  });
});

// ================= 3. Scale interval form 1, 2, 5 x 10^k =================
describe("scale interval form (R76-1 4.2.2.1)", () => {
  const good = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const bad = [0.003, 0.004, 0.006, 0.007, 0.03, 0.25, 0.3, 1.5, 2.5, 3, 4, 6, 7, 8, 9, 15, 25, 30, 40, 75, 150, 250, 300, 0, -5];
  it.each(good)("%s g is a valid scale interval", (x) => expect(isScaleIntervalForm(x)).toBe(true));
  it.each(bad)("%s g is not a valid scale interval", (x) => expect(isScaleIntervalForm(x)).toBe(false));
});

// ================= 4. Error formula E = I + 0.5 e - dL - L (A.4.4.3) =================
describe("error formula (R76-1 A.4.4.3)", () => {
  const rows: Array<[number, number, number, number]> = [];
  for (const e of [0.001, 0.01, 0.1, 1, 5, 20]) for (const [I, dLf, L] of [[1000, 0.3, 1000], [1000, 0.7, 999], [500, 0.5, 500], [2000, 0.1, 2001]] as const) rows.push([I, dLf * e, L, e]);
  it.each(rows)("I = %s, dL = %s, L = %s, e = %s", (I, dL, L, e) => {
    expect(errorOf(I, dL, L, e)).toBeCloseTo(I + 0.5 * e - dL - L, 9);
  });
});

// ================= 5. Decision rules =================
describe("decision rules", () => {
  const rows: Array<[number, number, number, string, string]> = [];
  for (const mpe_ of [2.5, 5, 7.5]) {
    for (const f of [0, 0.3, 0.8, 0.99, 1, 1.01, 1.5]) {
      for (const U of [0, 0.5, 2]) {
        const Ec = f * mpe_;
        const simple = Ec <= mpe_ + 1e-12 ? "PASS" : "FAIL";
        const guarded = Ec > mpe_ + 1e-12 ? "FAIL" : Ec + U > mpe_ + 1e-12 ? "CONDITIONAL" : "PASS";
        rows.push([Ec, mpe_, U, simple, guarded]);
      }
    }
  }
  it.each(rows)("|Ec| = %s, mpe = %s, U = %s -> simple %s, guarded %s", (Ec, m, U, simple, guarded) => {
    expect(decide(Ec, m, U, "simple")).toBe(simple);
    expect(decide(-Ec, m, U, "guarded")).toBe(guarded);
  });
});

// ================= 6. Discrimination and sensitivity =================
describe("discrimination extra load (R76-1 3.8 / Hdg A 3(8))", () => {
  const rows: Array<["OIML" | "IN", "digital" | "analog" | "non_self", number]> = [];
  for (const p of ["OIML", "IN"] as const) for (const ind of ["digital", "analog", "non_self"] as const) rows.push([p, ind, ind === "digital" ? 1.4 : ind === "analog" ? 1.0 : p === "OIML" ? 0.4 : 1.0]);
  it.each(rows)("%s %s: extra load factor %s", (p, ind, factor) => {
    const i: InstrumentProfile = { ...inst("III", 5, 30000, 100), indication: ind };
    const got = discriminationExtraLoad(ctx(i, PACKS[p]), 30000).extra_g;
    expect(got).toBeCloseTo(ind === "digital" ? factor * 5 : factor * 7.5, 9);
  });
});

describe("sensitivity of non-self-indicating instruments (R76-1 6.1)", () => {
  const rows: Array<[Cls, number, number, number]> = [
    ["I", 0.001, 100, 1], ["II", 0.1, 1000, 1], ["II", 1, 10000, 1],
    ["III", 5, 15000, 2], ["III", 5, 30000, 2], ["III", 10, 30010, 5], ["III", 50, 150000, 5],
    ["IIII", 10, 5000, 2], ["IIII", 20, 20000, 2], ["IIII", 50, 50000, 5],
  ];
  it.each(rows)("class %s, e %s g, Max %s g -> %s mm", (cls, e, max, mm) => {
    const i: InstrumentProfile = { ...inst(cls, e, max, 0), indication: "non_self" };
    for (const p of Object.values(PACKS)) expect(sensitivityRequired_mm(ctx(i, p))).toBe(mm);
  });
});

// ================= 7. Weight selection vs brute force =================
describe("chooseWeights vs brute-force minimum set", () => {
  const W = (id: string, n: number, U: number, due = "2030-01-01"): WeightItem => ({ id, nominal_g: n, class: "F1", conventional_mass_g: n, U_g: U, cal_due: due });
  const inv = [W("20a", 20000, 0.3), W("20b", 20000, 0.1), W("10a", 10000, 0.2), W("5a", 5000, 0.1), W("5b", 5000, 0.05), W("2a", 2000, 0.03), W("2b", 2000, 0.03),
    W("1a", 1000, 0.02), W("500", 500, 0.01), W("200a", 200, 0.005), W("200b", 200, 0.005), W("100", 100, 0.003), W("x", 50000, 0.01, "2020-01-01")];
  const valid = inv.filter((w) => w.cal_due > "2026");
  /** exhaustive search over all subsets: minimum count, then minimum U */
  const brute = (target: number) => {
    let best: WeightItem[] | null = null;
    for (let mask = 1; mask < 1 << valid.length; mask++) {
      const set = valid.filter((_, i) => mask & (1 << i));
      if (Math.abs(set.reduce((a, w) => a + w.nominal_g, 0) - target) > 1e-9) continue;
      const u = set.reduce((a, w) => a + w.U_g, 0);
      if (!best || set.length < best.length || (set.length === best.length && u < best.reduce((a, w) => a + w.U_g, 0) - 1e-12)) best = set;
    }
    return best;
  };
  const targets = [100, 300, 500, 700, 1000, 1500, 2500, 3000, 4000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 45000, 50000, 60000, 66000, 99999];
  it.each(targets)("target %s g", (t) => {
    const got = chooseWeights(t, inv, new Date("2026-09-25"));
    const exp = brute(t);
    expect(got.ok).toBe(!!exp);
    if (exp) {
      expect(got.items.length).toBe(exp.length);
      expect(got.U_g).toBeCloseTo(exp.reduce((a, w) => a + w.U_g, 0), 9);
      expect(got.items.some((w) => w.id === "x")).toBe(false);
    }
  });
});
