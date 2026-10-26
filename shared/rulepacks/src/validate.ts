import Ajv from "ajv";
import schema from "../rulepack.schema.json";

const ajv = new Ajv({ allErrors: true, strict: false });
const validator = ajv.compile(schema);

export interface SchemaResult {
  valid: boolean;
  errors: string[];
}

/** Validate a raw pack JSON (base or extension) against rulepack.schema.json. */
export function validatePackJson(json: unknown): SchemaResult {
  const valid = validator(json) as boolean;
  const errors = (validator.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
  return { valid, errors };
}
