import { describe, expect, it } from "vitest";
import { loadPack, rawPacks, canonicalJSON, resolvePack } from "../src";
import { validatePackJson } from "../src/validate";
import type { RulePack } from "../src";

describe("schema", () => {
  it("OIML pack validates", () => {
    const r = validatePackJson(rawPacks.OIML);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });
  it("IN pack validates", () => {
    const r = validatePackJson(rawPacks.IN);
    expect(r.errors).toEqual([]);
  });
  it("resolved IN pack validates as a full pack", () => {
    const { pack } = loadPack("IN");
    const { extends: _e, ...full } = pack as RulePack;
    expect(validatePackJson(JSON.parse(JSON.stringify(full))).errors).toEqual([]);
  });
  it("rejects a pack with a missing MPE class", () => {
    const bad = structuredClone(rawPacks.OIML) as any;
    delete bad.mpe_initial_verification.bands.IIII;
    expect(validatePackJson(bad).valid).toBe(false);
  });
});

describe("loader", () => {
  it("IN shows class IIII as IV", () => {
    const c = loadPack("IN").pack.accuracy_classes.find((x) => x.id === "IIII")!;
    expect(c.display).toBe("IV");
    expect(loadPack("OIML").pack.accuracy_classes.find((x) => x.id === "IIII")!.display).toBe("IIII");
  });
  it("IN digital discrimination has no d >= 5 mg exemption; non-self uses 1.0 mpe", () => {
    const d = loadPack("IN").pack.general_limits.discrimination;
    expect(d.digital.applies_if_d_g_gte).toBeNull();
    expect(d.non_self.extra_load_mpe).toBe(1.0);
    const o = loadPack("OIML").pack.general_limits.discrimination;
    expect(o.digital.applies_if_d_g_gte).toBe(0.005);
    expect(o.non_self.extra_load_mpe).toBe(0.4);
  });
  it("IN keeps OIML numeric MPE table and overrides the clause", () => {
    const i = loadPack("IN").pack.mpe_initial_verification;
    const o = loadPack("OIML").pack.mpe_initial_verification;
    expect(i.bands).toEqual(o.bands);
    expect(i.clause).toContain("Table 20");
  });
  it("IN test clause overrides are applied by id", () => {
    const t = loadPack("IN").pack.tests.find((x) => x.id === "T12")!;
    expect(t.clause).toBe("Hdg A Pt II 3(9)(iii)");
    expect(t.name).toBe("Power supply variations");
  });
  it("IN includes the 2026 substitution amendment", () => {
    const s = loadPack("IN").pack.general_limits.substitution;
    expect(s.clause).toContain("G.S.R. 568(E)");
    expect(s.standard_weights_min_fraction_of_max).toBe(0.5);
  });
  it("pack is frozen", () => {
    const { pack } = loadPack("OIML");
    expect(Object.isFrozen(pack.general_limits)).toBe(true);
  });
  it("packHash is stable and differs by profile", () => {
    const a = loadPack("OIML").packHash;
    const b = loadPack("IN").packHash;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    const again = resolvePack(structuredClone(rawPacks.OIML) as any, structuredClone(rawPacks.IN) as any);
    expect(canonicalJSON(again)).toBe(canonicalJSON(loadPack("IN").pack));
  });
  it("canonicalJSON sorts keys", () => {
    expect(canonicalJSON({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});
