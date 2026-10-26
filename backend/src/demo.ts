import { applicableTests, checklistFor, eAt, eccentricityLoad, ctx, mpe, mpeChangePoints, repeatabilityCount, staticTemperaturePlan, type InstrumentProfile, type RulePack } from "@tolpraman/engine";

/** Small deterministic PRNG so demo data is identical on every seed. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r10 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * A reading (I, dL) at load L with a target error Et, using the changeover method:
 * E = I + 0.5 e - dL - L. dL is chosen in steps of 0.1 e.
 */
export function readingFor(L: number, e: number, Et: number) {
  let I = Math.round(L / e) * e;
  let dL = 0.5 * e - Et - (I - L);
  while (dL < 0) { I += e; dL += e; }
  while (dL >= e) { I -= e; dL -= e; }
  dL = Math.round(dL / (0.1 * e)) * 0.1 * e;
  return { L: r10(L), I: r10(I), dL: r10(dL) };
}

function testLoads(inst: InstrumentProfile, pack: RulePack): number[] {
  const pts = new Set<number>([inst.min_g, ...mpeChangePoints(inst, pack), inst.max_g]);
  // Fill up to the 10 different loads that A.4.4.1 requires for the initial weighing test
  const fr = [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
  for (const f of fr) if (pts.size < 10) pts.add(Math.round((inst.max_g * f) / inst.e_g) * inst.e_g);
  return [...pts].filter((x) => x > 0).sort((a, b) => a - b).slice(0, 12);
}

/**
 * Generate complete, realistic inputs for every applicable test.
 * quality: fraction of mpe used by random errors (0.35 = comfortably passing).
 * overrides: forced error (g) at specific T01 loads, e.g. { 10000: 4.0 } for a CONDITIONAL row.
 */
export function demoInputs(inst: InstrumentProfile, pack: RulePack, seed = 1, quality = 0.35, overrides: Record<number, number> = {}): Record<string, unknown> {
  const R = rng(seed);
  const e = inst.e_g;
  const c = ctx(inst, pack);
  /** Reading at L using e of the partial range containing L (multi-interval aware). */
  const rd = (L: number, Et: number) => readingFor(L, eAt(inst, L), Et);
  const err = (L: number, q = quality) => (R() * 2 - 1) * q * mpe(inst, L, pack).mpe_g;
  const zero = () => rd(0, (R() * 2 - 1) * 0.1 * e);
  const app = new Set(applicableTests(inst, pack).filter((t) => t.applicable).map((t) => t.id));
  const loads = testLoads(inst, pack);
  const out: Record<string, unknown> = {};

  if (app.has("T01")) {
    const z = zero();
    const E0 = z.I + 0.5 * e - z.dL;
    const up = loads.map((L) => ({ ...rd(L, (overrides[L] ?? err(L)) + E0), dir: "up" }));
    const down = [...loads].reverse().map((L) => ({ ...rd(L, err(L) + E0), dir: "down" }));
    out.T01 = { zero: z, rows: [...up, ...down], initial: true };
  }
  if (app.has("T02")) {
    const temps = [20, inst.tempHigh_C ?? 40, inst.tempLow_C ?? -10, 5, 20];
    out.T02 = { rows: temps.map((T) => ({ T_C: T, ...rd(0, (R() * 2 - 1) * 0.3 * e) })).map(({ L: _L, ...x }) => x) };
  }
  if (app.has("T03")) {
    const L = Math.round(eccentricityLoad(c).load_g / e) * e;
    out.T03 = { zero: zero(), rows: ["1 (front-left)", "2 (front-right)", "3 (back-right)", "4 (back-left)", "5 (centre)"].map((p) => ({ position: p, ...rd(L, err(L)) })) };
  }
  if (app.has("T04")) {
    if (inst.indication === "digital") out.T04 = { rows: [inst.min_g, inst.max_g / 2, inst.max_g].map((L) => ({ L, I1: L, I2: r10(L + inst.d_g) })) };
    else if (inst.indication === "analog") out.T04 = { rows: [inst.min_g, inst.max_g / 2, inst.max_g].map((L) => ({ L, I1: L, I2: r10(L + mpe(inst, L, pack).mpe_g) })) };
    else out.T04 = { rows: [inst.min_g, inst.max_g / 2, inst.max_g].map((L) => ({ L, visible: true })) };
  }
  if (app.has("T05")) out.T05 = { rows: [0, inst.max_g].map((L) => ({ L, displacement_mm: 6 })) };
  if (app.has("T06")) {
    const n = repeatabilityCount(c);
    out.T06 = { series: [0.5, 1].map((f) => { const L = Math.round((inst.max_g * f) / e) * e; const base = err(L, 0.2); return { L, readings: Array.from({ length: n }, () => { const r = rd(L, base + (R() * 2 - 1) * 0.1 * e); return { I: r.I, dL: r.dL }; }) }; }) };
  }
  if (app.has("T07a")) out.T07a = { before: zero(), after: rd(0, (R() * 2 - 1) * 0.2 * e) };
  if (app.has("T07b")) {
    const L = Math.round((inst.max_g * 0.95) / e) * e;
    const base = err(L, 0.2);
    out.T07b = { L, rows: [0, 5, 10, 15, 20, 25, 30].map((t) => { const r = rd(L, base + (t / 30) * 0.15 * e); return { t_min: t, I: r.I, dL: r.dL }; }) };
  }
  if (app.has("T08")) {
    const L = Math.round((inst.max_g * 0.5) / e) * e;
    out.T08 = { prints: Array.from({ length: 5 }, () => ({ printed: L, min: L - (R() < 0.5 ? e : 0), max: L })), zeroTare: Array.from({ length: 5 }, () => rd(0, (R() * 2 - 1) * 0.15 * e)) };
  }
  if (app.has("T09")) {
    const Lc = mpeChangePoints(inst, pack)[0] ?? inst.max_g / 2;
    const rows: any[] = [];
    for (const dir of ["ref", "forward", "backward", "left", "right"]) {
      const z = rd(0, (R() * 2 - 1) * (dir === "ref" ? 0.1 : 0.8) * e);
      rows.push({ direction: dir, ...z });
      const E0 = z.I + 0.5 * e - z.dL;
      for (const L of [Lc, inst.max_g]) rows.push({ direction: dir, ...rd(L, E0 + err(L)) });
    }
    out.T09 = { tilt_per_mille: inst.levelIndicator === false ? 50 : 2, rows };
  }
  if (app.has("T10")) {
    const T = Math.round(((inst.maxTare_g ?? inst.max_g / 3) * 0.5) / e) * e;
    const netMax = inst.max_g - T;
    out.T10 = {
      rows: [inst.min_g, netMax * 0.25, netMax * 0.5, netMax].map((x) => Math.round(x / e) * e).map((L) => ({ tare_g: T, zero: zero(), ...rd(L, err(L)) })),
      setting: [rd(0, (R() * 2 - 1) * 0.1 * e)],
    };
  }
  if (app.has("T11")) {
    out.T11 = { L: inst.max_g, rows: [0, 5, 15, 30].map((t) => { const z = zero(); const E0 = z.I + 0.5 * e - z.dL; return { t_min: t, zero: z, loaded: rd(inst.max_g, E0 + err(inst.max_g)) }; }) };
  }
  if (app.has("T12")) {
    const U = 230;
    const rows: any[] = [];
    for (const [cond, f] of [["0.85 Unom", 0.85], ["1.10 Unom", 1.1]] as const) {
      const z = zero();
      const E0 = z.I + 0.5 * e - z.dL;
      for (const L of [10 * e, Math.round((inst.max_g * 0.75) / e) * e]) rows.push({ condition: cond, U_V: +(U * f).toFixed(1), zero: z, ...rd(L, E0 + err(L)) });
    }
    out.T12 = { rows };
  }
  if (app.has("T13")) {
    const L = Math.round((inst.max_g * 0.5) / e) * e;
    out.T13 = { rows: ["AC voltage dips & short interruptions", "Bursts (EFT)", "Surges", "Electrostatic discharge", "Radiated RF fields", "Conducted RF fields"].map((d) => ({ disturbance: d, L, I_without: L, I_with: L + (R() < 0.2 ? e : 0) })) };
  }
  if (app.has("T14")) {
    const L5 = [inst.min_g, ...mpeChangePoints(inst, pack), inst.max_g * 0.75, inst.max_g].map((x) => Math.round(x / e) * e).slice(0, 5);
    out.T14 = { phases: [["ref", 20, 50], ["high", inst.tempHigh_C ?? 40, 85], ["ref2", 20, 50]].map(([p, T, RH]) => ({ phase: p, T_C: T, RH_pct: RH, zero: zero(), rows: L5.map((L) => rd(L, err(L))) })) };
  }
  if (app.has("T15")) {
    const L = Math.round((inst.max_g * 0.9) / e) * e;
    const base = err(L, 0.15);
    out.T15 = { rows: Array.from({ length: 8 }, (_, k) => ({ date: `Day ${k * 3 + 1}`, zero: zero(), ...rd(L, base + (R() * 2 - 1) * 0.15 * e) })) };
  }
  if (app.has("T16")) {
    const L5 = [inst.min_g, inst.max_g * 0.5, inst.max_g].map((x) => Math.round(x / e) * e);
    const b = L5.map((L) => rd(L, err(L, 0.2)));
    out.T16 = { cycles: 100000, before: { zero: zero(), rows: b }, after: { zero: zero(), rows: L5.map((L) => rd(L, err(L, 0.3))) } };
  }
  if (app.has("T18")) {
    const r = (x: number) => Math.round(x / e) * e;
    out.T18 = {
      initial_pos_g: r(inst.max_g * 0.1), initial_neg_g: r(inst.max_g * 0.05), overall_g: r(inst.max_g * 0.02),
      accuracy: [{ mode: "non_automatic", ...rd(0, (R() * 2 - 1) * 0.15 * e) }, { mode: "automatic", ...rd(10 * e, (R() * 2 - 1) * 0.15 * e) }],
    };
  }
  if (app.has("T19")) {
    // Weighing test at every A.5.3.1 temperature; humidity kept below 20 g/m3 (about 35 % RH at 40 C).
    const pts = new Set<number>([inst.min_g, ...mpeChangePoints(inst, pack), inst.max_g].map((x) => Math.round(x / e) * e));
    for (const f of [0.5, 0.75, 0.25]) if (pts.size < 5) pts.add(Math.round((inst.max_g * f) / e) * e);
    const L5 = [...pts].filter((x) => x > 0).sort((a, b) => a - b);
    out.T19 = {
      phases: staticTemperaturePlan(c).required.map((t) => ({
        label: t.label[0].toUpperCase() + t.label.slice(1), T_C: t.T_C, RH_pct: t.T_C >= 30 ? 35 : 50, zero: zero(), rows: L5.map((L) => rd(L, err(L))),
      })),
    };
  }
  if (app.has("T17")) out.T17 = { items: checklistFor(pack).map((i) => ({ ...i, value: /^(Software: PC|Data storage)/.test(i.group ?? "") ? "na" : "yes" })) };
  return out;
}
