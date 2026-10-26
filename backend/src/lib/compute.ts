import {
  applicableTests, budget, ctx, evaluateCase, t06Repeatability, validateInstrument, type InstrumentProfile, type RulePack as Pack,
} from "@tolpraman/engine";
import type { Types } from "mongoose";
import { Case, Reading, Weight } from "../models";
import { GENESIS, chainHash } from "./hash";
import { packById } from "./packs";

/** Build the engine's InstrumentProfile from a stored case. */
export function toProfile(c: any): InstrumentProfile {
  const i = c.instrument ?? {};
  return {
    cls: i.cls ?? "III",
    max_g: Number(i.max_g ?? 0),
    min_g: Number(i.min_g ?? 0),
    e_g: Number(i.e_g ?? 0),
    d_g: Number(i.d_g ?? i.e_g ?? 0),
    ranges: i.ranges?.length ? i.ranges.map((r: any) => ({ max_g: r.max_g, e_g: r.e_g })) : undefined,
    rangeKind: i.rangeKind ?? undefined,
    indication: i.indication ?? "digital",
    power: i.power ?? "mains",
    electronic: i.electronic ?? true,
    directSale: !!i.directSale,
    software: !!i.software,
    liableToTilt: i.liableToTilt ?? true,
    hasTare: !!i.hasTare,
    maxTare_g: i.maxTare_g,
    maxAdditiveTare_g: i.maxAdditiveTare_g,
    supports: i.supports,
    receptor: i.receptor ?? "normal",
    grading: !!i.grading,
    tempLow_C: i.tempLow_C,
    tempHigh_C: i.tempHigh_C,
    levelIndicator: i.levelIndicator,
    tiltSensor: i.tiltSensor,
  };
}

/**
 * Server-side, authoritative evaluation. Never trusts client verdicts: results are recomputed
 * from the stored inputs with the rule pack the case is locked to.
 */
export async function recompute(caseDoc: any): Promise<void> {
  const pack = await packById(String(caseDoc.rulepack));
  const inst = toProfile(caseDoc);
  const v = validateInstrument(inst, pack);
  if (!v.valid) {
    caseDoc.results = [];
    caseDoc.verdict = "NOT_TESTED";
    caseDoc.counts = {};
    return;
  }
  const U = await uncertaintyFn(inst, pack, caseDoc.testInputs ?? {});
  const ev = evaluateCase(inst, pack, caseDoc.testInputs ?? {}, { rule: caseDoc.decisionRule ?? "simple", uncertainty: U });
  caseDoc.results = JSON.parse(JSON.stringify(ev.results));
  caseDoc.verdict = ev.verdict;
  caseDoc.counts = ev.counts;
  caseDoc.markModified("results");
  caseDoc.markModified("counts");
}

/**
 * U(L): weights from the lab register actually selected for the case (by certificate U),
 * resolution by changeover, and repeatability s from T06 (worst series) when available.
 */
async function uncertaintyFn(inst: InstrumentProfile, pack: Pack, inputs: Record<string, any>) {
  const weights = await Weight.find({ active: true }).lean();
  const byNominal = [...weights].sort((a, b) => b.nominal_g - a.nominal_g);
  let u_rep = 0;
  const t06 = inputs.T06;
  if (t06?.series) {
    try {
      const r = t06Repeatability(ctx(inst, pack), t06);
      u_rep = Math.max(0, ...Object.values(r.summary ?? {}).map(Number).filter(Number.isFinite));
    } catch { /* incomplete input */ }
  }
  return (L: number) => {
    // greedy decomposition for the budget estimate (the exact set is chosen in the UI with chooseWeights)
    let rem = Math.abs(L);
    const used: { U_g: number }[] = [];
    for (const w of byNominal) if (w.nominal_g <= rem + 1e-9) { used.push(w); rem -= w.nominal_g; }
    return budget(inst, L, pack, { weights: used, u_rep }).U;
  };
}

export function applicable(caseDoc: any, pack: Pack) {
  return applicableTests(toProfile(caseDoc), pack);
}

/** Minimum real elapsed time (minutes) between the first and the latest data entry for time-based tests. */
const TIME_RULES: Record<string, { minutes: (input: any) => number; label: string }> = {
  T07b: { label: "Creep", minutes: (i) => Math.max(0, ...(i?.rows ?? []).map((r: any) => Number(r.t_min) || 0)) },
  T11: { label: "Warm-up", minutes: (i) => Math.max(0, ...(i?.rows ?? []).filter((r: any) => r.loaded?.I != null).map((r: any) => Number(r.t_min) || 0)) },
  T07a: { label: "Return to zero", minutes: (i) => (i?.after?.I != null ? 30 : 0) },
  T19: { label: "Static temperatures", minutes: (i) => Math.max(0, (i?.phases ?? []).filter((p: any) => (p.rows ?? []).some((r: any) => r.I != null)).length - 1) * 120 },
  T14: { label: "Damp heat", minutes: (i) => ((i?.phases ?? []).some((p: any) => p.phase === "high" && (p.rows ?? []).some((r: any) => r.I != null)) ? 2 * 24 * 60 : 0) },
};

/**
 * Append a hash-chained reading record and flag time-implausible data
 * (e.g. a 4-hour creep reading entered 10 minutes after the first reading).
 */
export async function appendReading(caseDoc: any, testId: string, values: unknown, userId: string, source: "DEVICE" | "MANUAL" | "MIXED", at: Date = new Date()) {
  const last = await Reading.findOne({ case: caseDoc._id }).sort({ seq: -1 }).lean();
  const rec = {
    case: String(caseDoc._id), seq: (last?.seq ?? 0) + 1, testId, values: JSON.parse(JSON.stringify(values ?? null)), source,
    capturedAt: at.toISOString(), user: String(userId),
  };
  const prevHash = last?.hash ?? GENESIS;
  const hash = chainHash(rec, prevHash);
  await Reading.create({ ...rec, capturedAt: new Date(rec.capturedAt), prevHash, hash });

  const rule = TIME_RULES[testId];
  if (rule) {
    const first = await Reading.findOne({ case: caseDoc._id, testId }).sort({ seq: 1 }).lean();
    const claimed = rule.minutes(values);
    const elapsed = first ? (at.getTime() - new Date(first.capturedAt).getTime()) / 60000 : 0;
    const flags = (caseDoc.plausibilityFlags ?? []).filter((f: any) => f.testId !== testId);
    if (claimed > 0 && elapsed + 1 < claimed) {
      flags.push({ testId, at: new Date(), message: `${rule.label}: data claims ${claimed} min but only ${Math.round(elapsed)} min passed since the first entry for this test.` });
    }
    caseDoc.plausibilityFlags = flags;
  }
  return { seq: rec.seq, hash };
}

/** Verify the reading chain of a case. */
export async function verifyChain(caseId: Types.ObjectId | string) {
  const rs = await Reading.find({ case: caseId }).sort({ seq: 1 }).lean();
  let prev = GENESIS;
  for (const r of rs) {
    const rec = { case: String(r.case), seq: r.seq, testId: r.testId, values: r.values, source: r.source, capturedAt: new Date(r.capturedAt).toISOString(), user: String(r.user) };
    if (r.prevHash !== prev || chainHash(rec, prev) !== r.hash) return { ok: false, count: rs.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rs.length, head: prev };
}

export async function nextCaseNo(): Promise<string> {
  const { Lab } = await import("../models");
  const lab = await Lab.findOneAndUpdate({}, { $inc: { caseSeq: 1 } }, { new: true, upsert: true });
  const y = new Date().getFullYear();
  return `TE/${y}/${String(lab!.caseSeq).padStart(4, "0")}`;
}

export { Case };
