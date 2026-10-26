import crypto from "node:crypto";
import { canonicalJSON } from "@tolpraman/rulepacks";

export { canonicalJSON };

export const GENESIS = "0".repeat(64);

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** hash = sha256(canonicalJSON(record) + prevHash). */
export function chainHash(record: unknown, prevHash: string): string {
  return sha256(canonicalJSON(record) + prevHash);
}

export function randomId(bytes = 12): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
