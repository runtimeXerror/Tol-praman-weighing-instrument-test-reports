"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, loadSession, saveSession, type Session } from "./api";

type Role = Session["user"]["role"];

interface AuthCtx {
  user: Session["user"] | null;
  ready: boolean;
  login: (email: string, password: string, role?: Role) => Promise<Session["user"]>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export const ROLE_HOME: Record<Role, string> = { INCHARGE: "/incharge", ENGINEER: "/engineer", APPROVER: "/approver", ADMIN: "/admin/users" };
export const ROLE_LABEL: Record<Role, { en: string }> = {
  INCHARGE: { en: "Lab In-charge" },
  ENGINEER: { en: "Test Engineer" },
  APPROVER: { en: "Senior Engineer" },
  ADMIN: { en: "Administrator" },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Session["user"] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setUser(loadSession()?.user ?? null);
    sync();
    setReady(true);
    window.addEventListener("tp-session", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tp-session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback(async (email: string, password: string, role?: Role) => {
    const s = await api<Session>("/auth/login", { body: { email, password, role } });
    saveSession(s);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* already logged out */ }
    saveSession(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
