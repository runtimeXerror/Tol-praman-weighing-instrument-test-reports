import type { Request } from "express";
import { AuditLog } from "../models";
import { GENESIS, chainHash } from "./hash";

let tail: Promise<unknown> = Promise.resolve();

/**
 * Append an audit entry. Entries are hash-chained (hash = sha256(entry + prevHash)) and written
 * one at a time so the chain has no gaps even under concurrent requests.
 */
export function audit(req: Request | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}, caseId?: unknown) {
  const run = async () => {
    const last = await AuditLog.findOne().sort({ seq: -1 }).lean();
    const entry = {
      seq: (last?.seq ?? 0) + 1,
      at: new Date(),
      actor: req?.user?.id ?? null,
      actorName: req?.user?.name ?? "system",
      role: req?.user?.role ?? "SYSTEM",
      action,
      entity,
      entityId: entityId ?? null,
      case: caseId ?? null,
      details: JSON.parse(JSON.stringify(details ?? {})),
      ip: req?.ip ?? null,
    };
    const prevHash = last?.hash ?? GENESIS;
    const hash = chainHash({ ...entry, at: entry.at.toISOString(), actor: entry.actor ? String(entry.actor) : null, case: entry.case ? String(entry.case) : null }, prevHash);
    await AuditLog.create({ ...entry, prevHash, hash });
  };
  tail = tail.then(run, run);
  return tail;
}

export async function verifyAuditChain(): Promise<{ ok: boolean; count: number; brokenAt?: number }> {
  const all = await AuditLog.find().sort({ seq: 1 }).lean();
  let prev = GENESIS;
  for (const a of all) {
    const entry = {
      seq: a.seq, at: new Date(a.at!).toISOString(), actor: a.actor ? String(a.actor) : null, actorName: a.actorName, role: a.role,
      action: a.action, entity: a.entity, entityId: a.entityId ?? null, case: a.case ? String(a.case) : null, details: a.details ?? {}, ip: a.ip ?? null,
    };
    if (a.prevHash !== prev || chainHash(entry, prev) !== a.hash) return { ok: false, count: all.length, brokenAt: a.seq };
    prev = a.hash!;
  }
  return { ok: true, count: all.length };
}
