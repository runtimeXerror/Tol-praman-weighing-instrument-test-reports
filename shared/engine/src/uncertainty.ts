import { eAt } from "./instrument";
import { lim } from "./limits";
import { mpe } from "./mpe";
import { clean } from "./num";
import { decide } from "./verdict";
import type { DecisionRule, InstrumentProfile, RulePack, Verdict } from "./types";
import type { WeightItem } from "./weights";

export interface UncertaintyBudget {
  u_weight: number;
  u_res: number;
  u_rep: number;
  u_c: number;
  k: number;
  U: number;
}

/** u of the weights from certificates: U_i / 2 each, combined linearly (correlated, conservative). */
export function uWeights(used: Pick<WeightItem, "U_g">[], pack: RulePack): number {
  const cfg = lim<any>(pack, "uncertainty");
  const us = used.map((w) => w.U_g / cfg.coverage_k);
  return clean(cfg.weights_combination === "linear" ? us.reduce((a, b) => a + b, 0) : Math.sqrt(us.reduce((a, b) => a + b * b, 0)));
}

/** Resolution with the changeover method: u_res = 0.1 e / sqrt(3). */
export function uResolution(inst: InstrumentProfile, load_g: number, pack: RulePack): number {
  const cfg = lim<any>(pack, "uncertainty");
  return clean((cfg.resolution_step_e * eAt(inst, load_g)) / cfg.resolution_divisor);
}

/** Expanded uncertainty U = k * sqrt(u_w^2 + u_res^2 + u_rep^2). */
export function budget(inst: InstrumentProfile, load_g: number, pack: RulePack, p: { weights?: Pick<WeightItem, "U_g">[]; u_weight?: number; u_rep?: number }): UncertaintyBudget {
  const k = lim<any>(pack, "uncertainty").coverage_k as number;
  const u_weight = p.u_weight ?? uWeights(p.weights ?? [], pack);
  const u_res = uResolution(inst, load_g, pack);
  const u_rep = p.u_rep ?? 0;
  const u_c = Math.sqrt(u_weight ** 2 + u_res ** 2 + u_rep ** 2);
  return { u_weight: clean(u_weight), u_res, u_rep: clean(u_rep), u_c: clean(u_c), k, U: clean(k * u_c) };
}

/** Decision on one corrected error with the pack's MPE and a given U. */
export function decision(Ec: number, mpe_g: number, U: number, rule: DecisionRule): Verdict {
  return decide(Ec, mpe_g, U, rule);
}

/** Convenience: verdict for a load, Ec and U using the pack's MPE table. */
export function decisionAtLoad(inst: InstrumentProfile, pack: RulePack, load_g: number, Ec: number, U: number, rule: DecisionRule, inService = false) {
  const m = mpe(inst, load_g, pack, { inService });
  return { mpe_g: m.mpe_g, verdict: decide(Ec, m.mpe_g, U, rule), clause: m.clause };
}
