import type { RulePack } from "./types";

/**
 * Read a value from the pack's general_limits by dotted path. Throws if the key is missing,
 * so a pack that forgets a limit fails loudly instead of the engine silently using a default.
 */
export function lim<T = any>(pack: RulePack, path: string): T {
  let cur: any = pack.general_limits;
  for (const k of path.split(".")) {
    if (cur == null || !(k in cur)) throw new Error(`Rule pack ${pack.id} is missing general_limits.${path}`);
    cur = cur[k];
  }
  return cur as T;
}

/** Clause of a general_limits entry (entry.clause, or the parent's clause). */
export function limClause(pack: RulePack, path: string): string {
  const parts = path.split(".");
  for (let i = parts.length; i > 0; i--) {
    const v = lim<any>(pack, parts.slice(0, i).join("."));
    if (v && typeof v === "object" && typeof v.clause === "string") return v.clause;
  }
  return "";
}

export function testDef(pack: RulePack, id: string) {
  const t = pack.tests.find((x) => x.id === id);
  if (!t) throw new Error(`Rule pack ${pack.id} has no test ${id}`);
  return t;
}
