"use client";

import {
  AlertOctagon, BadgeCheck, CircleDashed, Copy, Download, FileCheck2, FileUp, Fingerprint, KeyRound, Landmark, Lock, QrCode,
  Scale, SearchX, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { date, mass } from "@/lib/format";
import { cn } from "@/lib/utils";

type CheckState = "ok" | "bad" | "pending" | "none";

/** One of the three checks shown under the status banner. */
function CheckTile({ state, icon: Icon, title, detail }: { state: CheckState; icon: typeof ShieldCheck; title: string; detail: React.ReactNode }) {
  const StateIcon = state === "ok" ? BadgeCheck : state === "bad" ? XCircle : CircleDashed;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3.5",
      state === "ok" ? "border-pass-100 bg-pass-50/70 dark:border-pass-500/40 dark:bg-pass-500/10"
        : state === "bad" ? "border-fail-100 bg-fail-50/70 dark:border-fail-500/40 dark:bg-fail-500/10"
          : "border-line surface-2")}>
      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg",
        state === "ok" ? "bg-pass-600 text-white" : state === "bad" ? "bg-fail-600 text-white" : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300")}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-semibold">
          {title}
          <StateIcon className={cn("h-4 w-4", state === "ok" ? "text-pass-600 dark:text-[#86efac]" : state === "bad" ? "text-fail-600 dark:text-[#fca5a5]" : "text-muted")} />
        </p>
        <p className="text-muted mt-0.5 text-xs leading-snug">{detail}</p>
      </div>
    </div>
  );
}

/** Public verification page (no login). Shows the summary only; upload a PDF to check it byte-for-byte. */
export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/verify/${encodeURIComponent(id)}`).then(async (r) => {
      if (r.status === 404) setNotFound(true);
      else setS(await r.json());
    }).catch(() => setNotFound(true));
  }, [id]);

  const upload = async (f: File) => {
    setBusy(true);
    setCheck(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await fetch(`/api/verify/${encodeURIComponent(id)}/file`, { method: "POST", body: fd });
      setCheck(await r.json());
    } finally { setBusy(false); }
  };

  const copyFingerprint = async () => {
    try { await navigator.clipboard.writeText(s.sha256); toast.success("Fingerprint copied"); } catch { toast.error("Could not copy"); }
  };

  const revoked = s?.status === "REVOKED";
  const superseded = !revoked && s?.status === "SUPERSEDED" && !!s?.supersededBy;
  const sigFailed = s?.signature?.valid === false;
  const bad = revoked || sigFailed;
  const fileState: CheckState = !check ? "pending" : check.match ? "ok" : "bad";

  return (
    <div className="bg-grid-light min-h-dvh">
      <header className="border-b border-line surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/"><Logo /></Link>
          <span className="text-muted inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Lock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Public report</span> verification
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {!s && !notFound && <div className="grid place-items-center py-20"><Spinner className="h-8 w-8" /></div>}
        {notFound && (
          <div className="card p-8 text-center animate-slide-up">
            <SearchX className="mx-auto h-12 w-12 text-fail-500" />
            <h1 className="mt-3 text-xl font-bold">No report with this verification ID</h1>
            <p className="text-muted mt-1 text-sm">Check the link or QR code. Draft reports are never issued a verification ID.</p>
          </div>
        )}
        {s && (
          <div className="space-y-5 animate-slide-up">
            <div className="card overflow-hidden">
              <div className={cn("relative flex flex-wrap items-center gap-5 px-6 py-6 text-white",
                bad ? "bg-gradient-to-r from-fail-600 to-fail-700" : superseded ? "bg-gradient-to-r from-slate-600 to-slate-700" : "bg-gradient-to-r from-pass-600 to-navy-600")}>
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                  {bad ? <ShieldAlert className="h-9 w-9" /> : <ShieldCheck className="h-9 w-9" />}
                </div>
                <div className="min-w-[13rem] flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-85">
                    {revoked ? "Revoked" : superseded ? "Superseded by a revised report" : sigFailed ? "Signature check failed" : "Genuine report"}
                  </p>
                  <h1 className="text-3xl font-bold tracking-tight">{s.reportNo}</h1>
                  <p className="text-sm opacity-90">Issued by {s.lab} on {date(s.signedAt, true)}</p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 text-center text-slate-900 shadow-lg max-sm:flex max-sm:w-full max-sm:items-center max-sm:justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Test result</p>
                  <VerdictBadge v={s.verdict} size="lg" className="sm:mt-1" />
                </div>
              </div>

              {revoked && <div className="bg-fail-50 px-6 py-3 text-sm text-fail-700 dark:bg-fail-700/15 dark:text-fail-100"><b>Revoked {date(s.revokedAt)}:</b> {s.revokeReason}</div>}
              {superseded && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 px-6 py-3 text-sm dark:bg-white/5">
                  <span>This report was replaced by <b>{s.supersededBy.reportNo}</b> on {date(s.supersededBy.signedAt)}. Use the revised report.</span>
                  <Link href={`/verify/${s.supersededBy.verifyId}`} className="font-semibold text-navy-600 hover:underline dark:text-navy-300">Open {s.supersededBy.reportNo} →</Link>
                </div>
              )}
              {s.underRevision && <div className="bg-saffron-50 px-6 py-3 text-sm dark:bg-saffron-400/10">The laboratory is preparing a revised report. This report stays valid until the revision is issued.</div>}
              {s.revision > 0 && s.supersedes && <div className="bg-navy-50 px-6 py-3 text-sm dark:bg-navy-400/10">Revision {s.revision}: replaces report {s.supersedes}.</div>}

              <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                <CheckTile state={revoked ? "bad" : "ok"} icon={Landmark} title="Lab register"
                  detail={revoked ? "Found, but withdrawn by the laboratory." : "Found in the laboratory's report register."} />
                <CheckTile state={!s.signature ? "none" : s.signature.valid ? "ok" : "bad"} icon={KeyRound} title="Digital signature"
                  detail={!s.signature ? "Issued before digital signatures were enabled." : s.signature.valid ? `${s.signature.algorithm} lab signature is valid.` : "Signature does not match."} />
                <CheckTile state={fileState} icon={FileCheck2} title="Your PDF copy"
                  detail={!check ? "Upload it below to compare fingerprints." : check.match ? "Identical to the issued report." : "Differs from the issued report."} />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-5">
              <div className="card p-5 md:col-span-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4 text-navy-600 dark:text-navy-300" /> Instrument evaluated</h2>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5">
                  {[
                    ["Manufacturer", s.manufacturer], ["Instrument", s.instrumentType], ["Model", s.model], ["Accuracy class", s.accuracyClass],
                    ["Max", mass(s.max_g)], ["e", mass(s.e_g)],
                  ].map(([k, v]) => <div key={k}><dt className="text-muted text-xs">{k}</dt><dd className="font-medium">{v ?? "—"}</dd></div>)}
                  <div className="col-span-2 border-t border-line pt-3.5">
                    <dt className="text-muted text-xs">Evaluated against</dt>
                    <dd className="font-medium">{s.basis?.startsWith("IN_") ? "Legal Metrology (General) Rules 2011, Heading A" : "OIML R 76"}</dd>
                  </div>
                </dl>
              </div>

              <div className="card p-5 md:col-span-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Fingerprint className="h-4 w-4 text-navy-600 dark:text-navy-300" /> Tamper evidence</h2>
                <p className="text-muted mt-3 text-xs">SHA-256 fingerprint of the issued PDF</p>
                <div className="surface-2 mt-1 flex items-start gap-2 rounded-lg border border-line p-2.5">
                  <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed">{s.sha256}</code>
                  <button onClick={copyFingerprint} className="text-muted shrink-0 rounded-md p-1 hover:bg-black/5 hover:text-navy-600 dark:hover:bg-white/10" aria-label="Copy fingerprint"><Copy className="h-3.5 w-3.5" /></button>
                </div>
                <p className="text-muted mt-4 text-xs">Laboratory digital signature</p>
                {!s.signature ? (
                  <p className="text-muted mt-1 text-sm">Not digitally signed. The fingerprint check still applies.</p>
                ) : s.signature.valid ? (
                  <div className="mt-1 space-y-1.5 text-sm">
                    <p className="inline-flex items-center gap-1 font-semibold text-pass-700 dark:text-[#86efac]"><BadgeCheck className="h-4 w-4" /> Valid signature</p>
                    <p className="text-muted text-xs">{s.signature.algorithm} · key ID <span className="font-mono">{s.signature.keyId}</span></p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                      <a href={`/api/verify/${id}/signature`} className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:underline dark:text-navy-300"><Download className="h-3.5 w-3.5" /> Signature file</a>
                      <a href="/api/verify/public-key" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:underline dark:text-navy-300"><KeyRound className="h-3.5 w-3.5" /> Lab public key</a>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 inline-flex items-start gap-1 text-sm font-semibold text-fail-600 dark:text-fail-400"><AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" /> Signature does not match. Do not rely on this report; contact the laboratory.</p>
                )}
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
              className={cn("card border-2 border-dashed p-6 transition", drag ? "border-navy-500 bg-navy-50/60 dark:bg-navy-400/10" : "border-line")}>
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-navy-50 text-navy-600 dark:bg-navy-400/15 dark:text-navy-300"><FileUp className="h-7 w-7" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Check the PDF you received</p>
                  <p className="text-muted text-sm">Drop it here. Its fingerprint is compared with the issued report, so any edit, even one character, is detected.</p>
                </div>
                <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                <Button loading={busy} onClick={() => input.current?.click()}>Choose PDF</Button>
              </div>
              {check && (
                <div className={cn("mt-5 flex items-start gap-3 rounded-xl p-4 text-left text-sm animate-slide-up",
                  check.result === "AUTHENTIC" ? "bg-pass-50 text-pass-700 dark:bg-pass-700/15 dark:text-pass-100" : "bg-fail-50 text-fail-700 dark:bg-fail-700/15 dark:text-fail-100")}>
                  {check.result === "AUTHENTIC" ? <BadgeCheck className="h-7 w-7 shrink-0" /> : <AlertOctagon className="h-7 w-7 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-base font-bold">{check.result === "AUTHENTIC" ? "AUTHENTIC — identical to the issued report" : check.result === "REVOKED" ? "File matches, but the report is REVOKED" : check.result === "SUPERSEDED" ? "File matches, but this report was replaced by a revised report" : "MODIFIED — this file is not the issued report"}</p>
                    <p className="mt-1 break-all font-mono text-[11px] opacity-80">uploaded {check.uploadedSha256}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [QrCode, "1. Scan", "The QR code on the report opens this page."],
                [KeyRound, "2. Signature", "The lab's Ed25519 key signs the report no. and its fingerprint."],
                [Fingerprint, "3. Fingerprint", "Your PDF's SHA-256 must equal the issued one, byte for byte."],
              ].map(([Icon, t, d]: any) => (
                <div key={t} className="flex items-start gap-2.5 px-1">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-navy-600 dark:text-navy-300" />
                  <p className="text-xs"><b>{t}.</b> <span className="text-muted">{d}</span></p>
                </div>
              ))}
            </div>
            <p className="text-muted text-center text-xs">This page shows a summary only. Readings and personal data are never published.</p>
          </div>
        )}
      </main>
    </div>
  );
}
