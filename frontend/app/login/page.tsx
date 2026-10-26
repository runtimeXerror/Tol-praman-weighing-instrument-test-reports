"use client";

import { ArrowRight, BadgeCheck, Calculator, Link2, Lock, Mail, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { errMsg } from "@/lib/api";
import { ROLE_HOME, useAuth } from "@/lib/auth";

type RoleId = "INCHARGE" | "ENGINEER" | "APPROVER" | "ADMIN";
const ROLES: Array<{ role: RoleId; title: string; text: string; demo: { email: string; password: string } }> = [
  { role: "INCHARGE", title: "Lab In-charge", text: "Receive instruments, assign test engineers, track progress", demo: { email: "incharge@tolpraman.demo", password: "Incharge@123" } },
  { role: "ENGINEER", title: "Test Engineer", text: "Enter readings, environment and attachments; submit", demo: { email: "engineer@tolpraman.demo", password: "Engineer@123" } },
  { role: "APPROVER", title: "Senior Engineer", text: "Review each test, send back for re-test, approve, sign & lock reports", demo: { email: "approver@tolpraman.demo", password: "Approver@123" } },
  { role: "ADMIN", title: "Admin", text: "Users, lab profile, equipment, standards, activity log", demo: { email: "admin@tolpraman.demo", password: "Admin@123" } },
];

function ScaleArt() {
  return (
    <svg viewBox="0 0 420 300" className="w-full max-w-md drop-shadow-2xl" aria-hidden>
      <defs>
        <linearGradient id="plat" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e7eefb" /><stop offset="1" stopColor="#b9cbe8" /></linearGradient>
        <linearGradient id="disp" x1="0" x2="1"><stop offset="0" stopColor="#0a254c" /><stop offset="1" stopColor="#061630" /></linearGradient>
      </defs>
      <ellipse cx="210" cy="270" rx="170" ry="16" fill="#000" opacity=".18" />
      <rect x="60" y="190" width="300" height="60" rx="14" fill="#0a254c" />
      <rect x="45" y="170" width="330" height="30" rx="10" fill="url(#plat)" />
      <g>
        <rect x="150" y="96" width="70" height="74" rx="6" fill="#FF904D" />
        <rect x="160" y="84" width="50" height="14" rx="4" fill="#ffab78" />
        <rect x="230" y="120" width="56" height="50" rx="6" fill="#f5731f" />
        <rect x="238" y="110" width="40" height="12" rx="4" fill="#ffab78" />
        <animateTransform attributeName="transform" type="translate" values="0 -6;0 0;0 0" dur="3s" repeatCount="indefinite" />
      </g>
      <rect x="120" y="206" width="180" height="34" rx="8" fill="url(#disp)" stroke="#3f76cf" strokeOpacity=".4" />
      <text x="290" y="231" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="20" fontWeight="700" fill="#76ff03">10.005 kg</text>
      <circle cx="136" cy="223" r="4" fill="#76ff03"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite" /></circle>
      <text x="136" y="252" fontSize="10" fill="#adc8ef" fontFamily="Inter">STABLE</text>
    </svg>
  );
}

function LoginForm() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [role, setRole] = useState<RoleId>("ENGINEER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifyId, setVerifyId] = useState("");

  useEffect(() => {
    if (ready && user) router.replace(sp.get("next") || ROLE_HOME[user.role]);
  }, [ready, user, router, sp]);

  const go = async () => {
    setBusy(true);
    try {
      const u = await login(email, password, role);
      toast.success(`Welcome, ${u.name}`);
      router.replace(sp.get("next") || ROLE_HOME[u.role]);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-navy-600 via-navy-800 to-navy-950 p-12 text-white lg:flex lg:flex-col">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-saffron-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-navy-400/30 blur-3xl" />
        <div className="relative"><Logo light /></div>
        <div className="relative mt-14 max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-navy-100 ring-1 ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-saffron-400" /> SIH 2026 · PS SIH26035 · Department of Consumer Affairs
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            NAWI type-evaluation reports, <span className="text-saffron-300">computed to the clause.</span>
          </h1>
          <p className="mt-4 text-lg text-navy-100/90">
            Record observations, get errors, MPE and verdicts per OIML R 76 and the Legal Metrology (General) Rules, 2011, and issue signed reports with a tamper-evident QR seal.
          </p>
        </div>
        <div className="relative mt-auto flex items-end justify-between gap-8">
          <ul className="space-y-3 text-sm">
            {[
              [Calculator, "Every result is calculated by fixed rules and shows the clause it comes from"],
              [Link2, "Every entry is recorded permanently; the person who tests cannot approve"],
              [QrCode, "PDF + Word reports; QR verification detects any edit"],
            ].map(([I, t], k) => {
              const Icon = I as typeof Calculator;
              return (
                <li key={k} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15"><Icon className="h-4 w-4 text-saffron-300" /></span>
                  <span className="max-w-xs text-navy-100">{t as string}</span>
                </li>
              );
            })}
          </ul>
          <div className="hidden w-80 xl:block"><ScaleArt /></div>
        </div>
      </section>

      {/* Login */}
      <section className="flex flex-col justify-center bg-grid-light px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
          <p className="text-muted mt-1 text-sm">Use your laboratory account. Your menu depends on your role.</p>

          <form className="card mt-6 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); go(); }}>
            <div>
              <Label htmlFor="role">Role</Label>
              <div className="relative">
                <UserRound className="text-muted pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" />
                <Select id="role" className="pl-9" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>
                  {ROLES.map((r) => <option key={r.role} value={r.role}>{r.title}</option>)}
                </Select>
              </div>
              <p className="text-muted mt-1 text-xs">{ROLES.find((r) => r.role === role)?.text}</p>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input id="email" type="email" autoComplete="username" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@lab.gov.in" required />
              </div>
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <div className="relative">
                <Lock className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input id="pw" type="password" autoComplete="current-password" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in as {ROLES.find((r) => r.role === role)?.title} <ArrowRight className="h-4 w-4" /></Button>
            <button type="button" className="w-full text-center text-xs font-medium text-navy-600 hover:underline dark:text-navy-300"
              onClick={() => { const d = ROLES.find((r) => r.role === role)!.demo; setEmail(d.email); setPassword(d.password); }}>
              Fill demo credentials for this role
            </button>
          </form>

          <form className="mt-8 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (verifyId.trim()) router.push(`/verify/${verifyId.trim()}`); }}>
            <div className="relative flex-1">
              <BadgeCheck className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input className="pl-9" placeholder="Verify a report: enter verification ID" value={verifyId} onChange={(e) => setVerifyId(e.target.value)} />
            </div>
            <Button variant="secondary" type="submit"><ShieldCheck className="h-4 w-4" /> Verify</Button>
          </form>
          <p className="text-muted mt-6 text-center text-xs">The same readings always give the same result · every verdict shows its OIML / LM Rules clause.</p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
