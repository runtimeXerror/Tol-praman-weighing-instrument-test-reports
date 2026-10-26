import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { canonicalJSON } from "./hash";

/**
 * Lab digital signature (Ed25519, node:crypto). The lab's private key never leaves the server; the
 * public key is published at /api/verify/public-key so anyone can check a report offline.
 * What is signed: a small statement that binds the report number, verification ID, signing time
 * and the SHA-256 of the final PDF bytes.
 */
export const SIG_ALG = "Ed25519";

let keys: { priv: crypto.KeyObject; pub: crypto.KeyObject; pem: string; keyId: string } | null = null;

function load() {
  if (keys) return keys;
  let priv: crypto.KeyObject;
  const file = path.join(config.keysDir, "lab-ed25519.pem");
  if (config.isTest) {
    priv = crypto.generateKeyPairSync("ed25519").privateKey;
  } else if (fs.existsSync(file)) {
    priv = crypto.createPrivateKey(fs.readFileSync(file));
  } else {
    priv = crypto.generateKeyPairSync("ed25519").privateKey;
    fs.mkdirSync(config.keysDir, { recursive: true });
    fs.writeFileSync(file, priv.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  const pub = crypto.createPublicKey(priv);
  const der = pub.export({ type: "spki", format: "der" });
  keys = { priv, pub, pem: String(pub.export({ type: "spki", format: "pem" })), keyId: crypto.createHash("sha256").update(der).digest("hex").slice(0, 16).toUpperCase() };
  return keys;
}

export interface Statement { v: 1; reportNo: string; verifyId: string; pdfSha256: string; signedAt: string; keyId: string }

export function statementFor(r: { reportNo: string; verifyId: string; sha256: string; signedAt: Date | string; keyId: string }): Statement {
  return { v: 1, reportNo: r.reportNo, verifyId: r.verifyId, pdfSha256: r.sha256, signedAt: new Date(r.signedAt).toISOString(), keyId: r.keyId };
}

export const labKeyId = () => load().keyId;
export const labPublicKeyPem = () => load().pem;

export function signStatement(s: Statement): string {
  return crypto.sign(null, Buffer.from(canonicalJSON(s)), load().priv).toString("base64");
}

/** True only if the signature is valid for this statement under the lab's current key. */
export function verifyStatement(s: Statement, signature: string | null | undefined): boolean {
  if (!signature || s.keyId !== load().keyId) return false;
  try { return crypto.verify(null, Buffer.from(canonicalJSON(s)), load().pub, Buffer.from(signature, "base64")); } catch { return false; }
}
