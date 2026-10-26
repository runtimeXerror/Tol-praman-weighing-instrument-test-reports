import { describe, expect, it } from "vitest";
import { loadPack } from "@tolpraman/rulepacks";
import { mpe, mpeEnvelope, type InstrumentProfile } from "../src";

const OIML = loadPack("OIML").pack;
const IN = loadPack("IN").pack;
const inst = (p: Partial<InstrumentProfile>): InstrumentProfile => ({
  cls: "III", max_g: 30000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains", electronic: true, ...p,
});

describe("mpeEnvelope: ±mpe steps for the error-vs-load chart", () => {
  it("class III 30 kg / e = 5 g: 2.5 / 5 / 7.5 g steps at 2500 and 10000 g", () => {
    expect(mpeEnvelope(inst({}), OIML)).toEqual([
      { from_g: 0, to_g: 2500, mpe_g: 2.5, e_g: 5 },
      { from_g: 2500, to_g: 10000, mpe_g: 5, e_g: 5 },
      { from_g: 10000, to_g: 30000, mpe_g: 7.5, e_g: 5 },
    ]);
  });

  it("multi-interval: steps follow e_i of each partial range", () => {
    const i = inst({ max_g: 15000, min_g: 40, e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }] });
    const s = mpeEnvelope(i, OIML);
    expect(s[0]).toMatchObject({ from_g: 0, mpe_g: 1 });
    expect(s.find((x) => x.to_g === 6000)).toMatchObject({ mpe_g: 3, e_g: 2 });
    expect(s.at(-1)).toMatchObject({ to_g: 15000, e_g: 5 });
  });

  it("in service doubles every step", () => {
    const a = mpeEnvelope(inst({}), IN);
    const b = mpeEnvelope(inst({}), IN, { inService: true });
    b.forEach((s, k) => expect(s.mpe_g).toBe(a[k].mpe_g * 2));
  });

  const cases: Array<[string, Partial<InstrumentProfile>]> = [
    ["III 30 kg e5", {}],
    ["II 600 g e0.1", { cls: "II", max_g: 600, min_g: 2, e_g: 0.1, d_g: 0.01 }],
    ["I 220 g e0.001", { cls: "I", max_g: 220, min_g: 0.1, e_g: 0.001, d_g: 0.0001 }],
    ["IIII 5 kg e5", { cls: "IIII", max_g: 5000, min_g: 50 }],
    ["III 60 t e20 kg", { max_g: 60000000, min_g: 400000, e_g: 20000, d_g: 20000 }],
  ];
  for (const [name, p] of cases) {
    for (const pack of [OIML, IN]) {
      it(`${pack.profile} ${name}: contiguous from 0 to Max, and equals mpe() at every load sampled`, () => {
        const i = inst(p);
        const s = mpeEnvelope(i, pack);
        expect(s[0].from_g).toBe(0);
        expect(s.at(-1)!.to_g).toBe(i.max_g);
        s.slice(1).forEach((x, k) => expect(x.from_g).toBe(s[k].to_g));
        for (let k = 0; k <= 200; k++) {
          const L = (i.max_g * k) / 200;
          const step = s.find((x) => (L === 0 ? x.from_g === 0 : L > x.from_g && L <= x.to_g))!;
          expect(step.mpe_g).toBe(mpe(i, L, pack).mpe_g);
        }
      });
    }
  }
});
