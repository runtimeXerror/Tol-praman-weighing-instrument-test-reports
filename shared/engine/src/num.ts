/** Numeric helpers. All masses are grams (JS doubles); results are cleaned to 1e-9 g. */

export const EPS = 1e-9;

/** Remove binary floating-point noise (e.g. 0.1 + 0.2). */
export function clean(x: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

/** a <= b with a relative tolerance, so 2500/5 <= 500 behaves as the standard intends. */
export function lte(a: number, b: number): boolean {
  return a <= b + EPS * Math.max(1, Math.abs(a), Math.abs(b));
}

export function gte(a: number, b: number): boolean {
  return lte(b, a);
}

export function gt(a: number, b: number): boolean {
  return !lte(a, b);
}

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** True if x is 1, 2 or 5 x 10^k (R76-1 4.2.2.1). */
export function isScaleIntervalForm(x: number, mantissas: number[] = [1, 2, 5]): boolean {
  if (!(x > 0) || !Number.isFinite(x)) return false;
  const k = Math.floor(Math.log10(x) + 1e-12);
  const m = x / Math.pow(10, k);
  return mantissas.some((mm) => Math.abs(m - mm) < 1e-9 * mm);
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n - 1). */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
