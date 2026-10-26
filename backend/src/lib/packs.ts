import { finalizePack, loadPack, rawPacks, resolvePack, type Profile, type RulePack as Pack } from "@tolpraman/rulepacks";
import { validatePackJson } from "@tolpraman/rulepacks/validate";
import { RulePack } from "../models";
import { audit } from "./audit";
import { bad, notFound } from "./http";

const cache = new Map<string, Pack>();

/** Insert the built-in OIML and IN packs if missing, and make them active when nothing else is. */
export async function ensureBuiltInPacks(): Promise<void> {
  for (const profile of ["OIML", "IN"] as Profile[]) {
    const { pack, packHash } = loadPack(profile);
    const exists = await RulePack.findOne({ packId: pack.id, version: pack.version });
    if (exists && exists.builtIn && exists.hash !== packHash) {
      // The pack file changed without a new version: cases keep the stored content. Bump "version" in the JSON.
      console.warn(`Rule pack ${pack.id} v${pack.version}: the file differs from the stored version; give the changed pack a new version.`);
    }
    if (!exists) {
      // A newer built-in version replaces an active older built-in one; a lab-uploaded active version is left alone.
      // Cases already evaluated stay locked to the version they were evaluated with.
      const active = await RulePack.findOne({ profile, active: true });
      const take = !active || active.builtIn;
      if (active && take) { active.active = false; await active.save(); }
      const created = await RulePack.create({
        packId: pack.id, profile, version: pack.version, title: pack.title, raw: rawPacks[profile],
        resolved: JSON.parse(JSON.stringify(pack)), hash: packHash, active: take, builtIn: true,
      });
      if (active && take) await audit(null, "RULEPACK_BUILTIN_UPDATED", "RulePack", String(created._id), { profile, from: active.version, to: pack.version });
    }
  }
}

export async function activePack(profile: Profile) {
  const p = await RulePack.findOne({ profile, active: true }).lean();
  if (!p) throw notFound(`Active ${profile === "IN" ? "LM Rules" : "OIML"} standard version`);
  return p;
}

/** Resolved pack JSON for a stored rule pack (by Mongo id), cached. */
export async function packById(id: string): Promise<Pack> {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = await RulePack.findById(id).lean();
  if (!p) throw notFound("Rule pack");
  const pack = Object.freeze(p.resolved) as Pack;
  cache.set(id, pack);
  return pack;
}

/**
 * Validate and resolve an uploaded pack. Extension packs (IN) are resolved on top of the
 * currently active OIML base. Returns the resolved pack and its hash.
 */
export async function prepareUpload(raw: any): Promise<{ resolved: Pack; hash: string }> {
  const sv = validatePackJson(raw);
  if (!sv.valid) throw bad("This file is not a valid standard version", sv.errors);
  let resolved: Pack;
  if (raw.extends) {
    const base = await RulePack.findOne({ packId: raw.extends, active: true }).lean();
    if (!base) throw bad(`The base standard (${raw.extends}) is not active`);
    resolved = resolvePack(structuredClone(base.resolved), structuredClone(raw));
  } else {
    resolved = structuredClone(raw);
  }
  const full = { ...resolved } as any;
  delete full.extends;
  const again = validatePackJson(JSON.parse(JSON.stringify(full)));
  if (!again.valid) throw bad("This standard version is incomplete", again.errors);
  const { packHash } = finalizePack(structuredClone(resolved));
  return { resolved, hash: packHash };
}
