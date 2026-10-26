import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import oimlJson from "../packs/oiml_r76_rulepack.json";
import inJson from "../packs/in_lm_gr2011_sch7a_rulepack.json";
import type { LoadedPack, Profile, RulePack } from "./types";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deep merge used for pack extension: objects merge key by key, everything else
 * (arrays, numbers, strings, null) in the override replaces the base value.
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override) as T;
  const out: Record<string, unknown> = { ...structuredClone(base) };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out && isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out as T;
}

/** JSON with object keys sorted recursively, no whitespace. Stable across runs and platforms. */
export function canonicalJSON(value: unknown): string {
  const walk = (v: unknown): Json => {
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) {
      const o: Record<string, Json> = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = walk(v[k]);
      return o;
    }
    return v as Json;
  };
  return JSON.stringify(walk(value));
}

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

function deepFreeze<T>(o: T): Readonly<T> {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

/** Resolve an extension pack (extends + overrides + test_overrides) on top of its base. */
export function resolvePack(base: RulePack, ext: Record<string, any>): RulePack {
  if (!ext.extends) return structuredClone(ext) as RulePack;
  if (ext.extends !== base.id) throw new Error(`Pack ${ext.id} extends ${ext.extends}, but base is ${base.id}`);
  const merged = deepMerge(base, ext.overrides ?? {}) as RulePack;
  const tovr: Record<string, Record<string, unknown>> = ext.test_overrides ?? {};
  merged.tests = merged.tests.map((t) => (tovr[t.id] ? deepMerge(t, tovr[t.id]) : t));
  merged.id = ext.id;
  merged.profile = ext.profile;
  merged.version = ext.version;
  merged.title = ext.title;
  merged.extends = ext.extends;
  merged.source = ext.source;
  return merged;
}

export function finalizePack(pack: RulePack): LoadedPack {
  const packHash = sha256Hex(canonicalJSON(pack));
  return { pack: deepFreeze(pack), packHash };
}

const cache = new Map<Profile, LoadedPack>();

/** Load the built-in pack for a profile. "IN" = India overrides deep-merged on top of OIML. */
export function loadPack(profile: Profile): LoadedPack {
  const hit = cache.get(profile);
  if (hit) return hit;
  const base = structuredClone(oimlJson) as unknown as RulePack;
  const pack = profile === "OIML" ? base : resolvePack(base, structuredClone(inJson) as Record<string, any>);
  const loaded = finalizePack(pack);
  cache.set(profile, loaded);
  return loaded;
}

export const rawPacks = { OIML: oimlJson, IN: inJson } as const;
