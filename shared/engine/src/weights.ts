import { lim } from "./limits";
import { mpe } from "./mpe";
import { clean } from "./num";
import type { InstrumentProfile, RulePack } from "./types";

export type WeightClass = "E1" | "E2" | "F1" | "F2" | "M1" | "M1-2" | "M2" | "M2-3" | "M3";

export interface WeightItem {
  id: string;
  nominal_g: number;
  class: WeightClass;
  conventional_mass_g: number;
  /** Expanded uncertainty (k = 2) from the calibration certificate. */
  U_g: number;
  /** Calibration due date, ISO yyyy-mm-dd. */
  cal_due: string;
  certificate?: string;
}

export function isExpired(w: WeightItem, today: Date = new Date()): boolean {
  const due = new Date(w.cal_due + "T23:59:59");
  return !(due.getTime() >= today.getTime());
}

export interface WeightSelection {
  ok: boolean;
  items: WeightItem[];
  nominal_g: number;
  /** L used in calculations: sum of conventional masses (not nominal). */
  conventional_g: number;
  U_g: number;
  message?: string;
}

const units = (g: number) => Math.round(g * 1e6); // micrograms, exact integer arithmetic

/**
 * Minimum number of valid (not expired) weights whose nominal values sum to the target.
 * Tie-break: lowest combined uncertainty. Depth-first branch and bound over the inventory.
 */
export function chooseWeights(target_g: number, inventory: WeightItem[], today: Date = new Date(), nodeLimit = 200_000): WeightSelection {
  const valid = inventory.filter((w) => !isExpired(w, today)).sort((a, b) => b.nominal_g - a.nominal_g || a.U_g - b.U_g);
  const target = units(target_g);
  let best: WeightItem[] | null = null;
  let bestU = Infinity;
  let nodes = 0;
  const suffix: number[] = new Array(valid.length + 1).fill(0);
  for (let i = valid.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + units(valid[i].nominal_g);

  const pick: WeightItem[] = [];
  const dfs = (i: number, remaining: number, U: number) => {
    if (++nodes > nodeLimit) return;
    if (remaining === 0) {
      if (!best || pick.length < best.length || (pick.length === best.length && U < bestU - 1e-15)) {
        best = [...pick];
        bestU = U;
      }
      return;
    }
    if (i >= valid.length || suffix[i] < remaining) return;
    if (best && pick.length + 1 > best.length) return;
    const w = valid[i];
    const wu = units(w.nominal_g);
    if (wu <= remaining) {
      pick.push(w);
      dfs(i + 1, remaining - wu, U + w.U_g);
      pick.pop();
    }
    // Skipping this weight: also skip later weights of the same nominal (sorted by U ascending),
    // since taking one of those instead of this one is never better.
    let j = i + 1;
    while (j < valid.length && units(valid[j].nominal_g) === wu) j++;
    dfs(j, remaining, U);
  };
  dfs(0, target, 0);

  if (!best) {
    const expired = inventory.filter((w) => isExpired(w, today)).length;
    return { ok: false, items: [], nominal_g: 0, conventional_g: 0, U_g: 0, message: `No combination of valid weights makes ${target_g} g${expired ? ` (${expired} weights blocked: calibration expired)` : ""}.` };
  }
  const items: WeightItem[] = best;
  return {
    ok: true,
    items,
    nominal_g: clean(items.reduce((a, w) => a + w.nominal_g, 0)),
    conventional_g: clean(items.reduce((a, w) => a + w.conventional_mass_g, 0)),
    U_g: clean(items.reduce((a, w) => a + w.U_g, 0)),
  };
}

export interface ThirdMpeCheck {
  ok: boolean;
  limit_g: number;
  error_g: number;
  U_g: number;
  basis: "error" | "uncertainty";
  clause: string;
  message: string;
}

/**
 * Test weights shall not have an error greater than 1/3 of the mpe for the applied load.
 * For E2 or better, their uncertainty (instead of error) may be compared (R76-1 3.7.1 / Hdg A 9(2)(i)).
 */
export function checkThirdMpe(load_g: number, used: WeightItem[], inst: InstrumentProfile, pack: RulePack, opts: { inService?: boolean } = {}): ThirdMpeCheck {
  const cfg = lim<{ error_fraction_of_mpe: number; clause: string }>(pack, "test_weights");
  const m = mpe(inst, load_g, pack, opts).mpe_g;
  const limit = clean(cfg.error_fraction_of_mpe * m);
  const error = clean(Math.abs(used.reduce((a, w) => a + (w.conventional_mass_g - w.nominal_g), 0)));
  const U = clean(used.reduce((a, w) => a + w.U_g, 0));
  const allE = used.length > 0 && used.every((w) => w.class === "E1" || w.class === "E2");
  const basis = allE ? "uncertainty" : "error";
  const value = allE ? U : error;
  const ok = value <= limit + 1e-12;
  return {
    ok,
    limit_g: limit,
    error_g: error,
    U_g: U,
    basis,
    clause: cfg.clause,
    message: ok ? `Weights ${basis} ${value} g <= mpe/3 = ${limit} g` : `Weights ${basis} ${value} g exceeds mpe/3 = ${limit} g: use better weights`,
  };
}
