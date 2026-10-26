import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = () => t && clearTimeout(t);
  return d;
}

/** Read a dotted path ("zero.I", "rows.3.L"). */
export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Immutable set of a dotted path. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const root: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    const nextKeyIsIndex = /^\d+$/.test(keys[i + 1]);
    cur[k] = Array.isArray(next) ? [...next] : next && typeof next === "object" ? { ...next } : nextKeyIsIndex ? [] : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}
