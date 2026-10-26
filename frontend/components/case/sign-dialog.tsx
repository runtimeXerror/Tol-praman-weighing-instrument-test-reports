"use client";

import { BadgeCheck, ExternalLink, FileDown, Lock, PenLine, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, download, errMsg } from "@/lib/api";
import { mass } from "@/lib/format";
import { VerdictBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog } from "../ui/misc";

export function SignDialog({ c, open, onClose, onDone }: { c: any; open: boolean; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const sign = async () => {
    setBusy(true);
    try {
      const r = await api(`/cases/${c.id}/sign`, { method: "POST" });
      setRes(r);
      toast.success(`Signed · ${r.reportNo}`);
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const verifyUrl = res ? `${window.location.origin}/verify/${res.verifyId}` : "";
  return (
    <Dialog open={open} onClose={() => { setRes(null); onClose(); }} title={res ? "Report signed & locked" : `Sign & lock ${c?.caseNo ?? ""}`}
      subtitle={res ? res.reportNo : "Creates the final PDF with a QR seal, signs it with the laboratory's digital signature, then locks the case permanently."}
      footer={res ? (
        <>
          <Button variant="secondary" onClick={() => download(`/reports/${res.reportId}/docx`, `${res.reportNo.replace(/\//g, "-")}.docx`)}><FileDown className="h-4 w-4" /> Word (editable)</Button>
          <Button onClick={() => download(`/reports/${res.reportId}/pdf`, "", true)}><FileDown className="h-4 w-4" /> Open PDF</Button>
        </>
      ) : (
        <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={sign}><PenLine className="h-4 w-4" /> Sign & lock</Button></>
      )}>
      {res ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-pass-50 p-3 text-pass-700 dark:bg-pass-700/15 dark:text-pass-100"><BadgeCheck className="h-6 w-6" /> The report is sealed. Anyone can verify it by scanning the QR code on every page.</div>
          <div><p className="text-muted text-xs">Verification link</p><a className="break-all font-medium text-navy-600 underline dark:text-navy-300" href={verifyUrl} target="_blank" rel="noreferrer">{verifyUrl} <ExternalLink className="inline h-3.5 w-3.5" /></a></div>
          <div><p className="text-muted text-xs">Digital fingerprint of the final PDF (detects any edit)</p><p className="break-all font-mono text-xs">{res.sha256}</p></div>
        </div>
      ) : c ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl surface-2 p-3"><p className="text-muted text-xs">Instrument</p><p className="font-semibold">{c.instrument?.model} · {mass(c.instrument?.max_g)}</p></div>
            <div className="rounded-xl surface-2 p-3"><p className="text-muted text-xs">Overall verdict</p><VerdictBadge v={c.verdict} /></div>
          </div>
          <ul className="space-y-1.5 text-[13px]">
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-pass-600" /> All results are calculated again with the case's standard version before signing.</li>
            <li className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-pass-600" /> The recorded data is checked for tampering; signing is blocked if anything was altered.</li>
            <li className="flex gap-2"><Lock className="h-4 w-4 shrink-0 text-navy-600" /> After signing, nothing in the case can be changed. Corrections need a revocation and a new case.</li>
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}
