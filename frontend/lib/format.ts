/** Display helpers. Grams internally; shown in the most readable unit. */

export function mass(g: number | null | undefined, digits?: number): string {
  if (g === null || g === undefined || !Number.isFinite(g)) return "—";
  const a = Math.abs(g);
  const p = (x: number) => (digits !== undefined ? x.toFixed(digits) : String(+x.toPrecision(10)));
  if (a >= 1_000_000) return `${p(g / 1_000_000)} t`;
  if (a >= 1000) return `${p(g / 1000)} kg`;
  if (a > 0 && a < 1) return `${p(g * 1000)} mg`;
  return `${p(g)} g`;
}

export function num(v: unknown, dp?: number): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (dp !== undefined) return v.toFixed(dp);
  return String(+v.toPrecision(10));
}

export function signed(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const s = String(+v.toPrecision(10));
  return v > 0 ? `+${s}` : s;
}

export function date(d: string | Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleString("en-IN", withTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" });
}

export function ago(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(d);
}

export const STATUS_META: Record<string, { label: string; tone: string; step: number }> = {
  DRAFT: { label: "Draft", tone: "slate", step: 0 },
  RETURNED: { label: "Returned", tone: "saffron", step: 0 },
  SUBMITTED: { label: "Submitted", tone: "navy", step: 1 },
  REVIEWED: { label: "Reviewed", tone: "navy", step: 2 },
  APPROVED: { label: "Approved", tone: "violet", step: 2 },
  SIGNED: { label: "Signed & locked", tone: "pass", step: 3 },
};

export const VERDICT_META: Record<string, { label: string }> = {
  PASS: { label: "Pass" },
  CONDITIONAL: { label: "Conditional" },
  FAIL: { label: "Fail" },
  NOT_APPLICABLE: { label: "N/A" },
  NOT_TESTED: { label: "Pending" },
};
