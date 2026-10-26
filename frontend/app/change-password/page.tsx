"use client";

import { ArrowLeft, Check, KeyRound, Lock, LogOut, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";
import { api, errMsg, saveSession, type Session } from "@/lib/api";
import { ROLE_HOME, ROLE_LABEL, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Same rules as the server (backend/src/auth.ts passwordProblem). */
const RULES = [
  { label: "At least 8 characters", ok: (p: string) => p.length >= 8 },
  { label: "Contains a letter", ok: (p: string) => /[A-Za-z]/.test(p) },
  { label: "Contains a number", ok: (p: string) => /\d/.test(p) },
];

export default function ChangePassword() {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/change-password");
  }, [ready, user, router]);

  if (!ready || !user) return <div className="grid min-h-dvh place-items-center"><Spinner className="h-8 w-8" /></div>;

  const forced = !!user.mustChangePassword;
  const rulesOk = RULES.every((r) => r.ok(next));
  const matches = next.length > 0 && next === confirm;
  const differs = next.length > 0 && next !== current;
  const canSave = current.length > 0 && rulesOk && matches && differs;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<Session & { ok: boolean }>("/auth/password", { body: { current, next } });
      saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user });
      toast.success("Password changed. Other sessions were signed out.");
      router.replace(ROLE_HOME[r.user.role]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-grid-light flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          {!forced && (
            <button onClick={() => router.back()} className="text-muted inline-flex items-center gap-1 text-sm hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" /> Back</button>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-600 dark:bg-navy-900/60 dark:text-navy-200"><KeyRound className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold">{forced ? "Set your own password" : "Change password"}</h1>
              <p className="text-muted text-sm">{user.name} · {ROLE_LABEL[user.role].en}</p>
            </div>
          </div>

          {forced && (
            <p className="mt-4 rounded-xl bg-cond-50 p-3 text-sm text-cond-700 dark:bg-cond-700/15 dark:text-cond-100">
              Your account was created (or reset) by the administrator with a temporary password. Choose your own password to continue.
            </p>
          )}

          <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSave) save(); }}>
            <div>
              <Label htmlFor="cur">{forced ? "Temporary password" : "Current password"}</Label>
              <div className="relative">
                <Lock className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input id="cur" type="password" autoComplete="current-password" className="pl-9" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="new">New password</Label>
              <div className="relative">
                <KeyRound className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input id="new" type="password" autoComplete="new-password" className="pl-9" value={next} onChange={(e) => setNext(e.target.value)} required />
              </div>
              <ul className="mt-2 space-y-1">
                {[...RULES.map((r) => ({ label: r.label, ok: r.ok(next) })), { label: "Different from the current password", ok: differs }].map((r) => (
                  <li key={r.label} className={cn("flex items-center gap-1.5 text-xs", r.ok ? "text-pass-600" : "text-muted")}>
                    {r.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Label htmlFor="conf">Confirm new password</Label>
              <div className="relative">
                <KeyRound className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input id="conf" type="password" autoComplete="new-password" className="pl-9" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={confirm.length > 0 && !matches} required />
              </div>
              {confirm.length > 0 && !matches && <p className="mt-1 text-xs text-fail-600">Passwords do not match</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!canSave}>
              <ShieldCheck className="h-4 w-4" /> {forced ? "Set password & continue" : "Change password"}
            </Button>
          </form>

          {forced && (
            <button onClick={async () => { await logout(); router.replace("/login"); }} className="text-muted mx-auto mt-4 flex items-center gap-1.5 text-xs hover:text-[var(--text)]">
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          )}
        </div>
        <p className="text-muted mt-4 text-center text-xs">Changing your password signs you out on all other devices.</p>
      </div>
    </div>
  );
}
