"use client";

/** Thin fetch client for the backend (/api is rewritten to the backend by next.config.ts). */

const KEY = "tp-auth";

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: "INCHARGE" | "ENGINEER" | "APPROVER" | "ADMIN"; designation?: string; mustChangePassword?: boolean };
}

export function loadSession(): Session | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("tp-session"));
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const s = loadSession();
  if (!s?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
      if (!r.ok) return false;
      saveSession(await r.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; raw?: boolean } = {}, retry = true): Promise<T> {
  const s = loadSession();
  const headers: Record<string, string> = {};
  if (s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && retry && s?.refreshToken && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, opts, false);
    saveSession(null);
  }
  if (!res.ok) {
    let j: any = {};
    try { j = await res.json(); } catch { /* not json */ }
    throw new ApiError(res.status, j.error ?? `Request failed (${res.status})`, j.details);
  }
  if (opts.raw) return res as unknown as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

/** Download an authenticated file (PDF/DOCX) and open or save it. */
export async function download(path: string, filename: string, open = false) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank", "noopener");
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details;
    if (Array.isArray(d) && d.length) return `${e.message}: ${d.join("; ")}`;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
