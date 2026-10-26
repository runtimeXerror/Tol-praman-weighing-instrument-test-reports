"use client";

import { Check, CheckCheck, ChevronDown, CircleDashed, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, VerdictBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/form";
import { ProgressBar } from "../ui/misc";

/** One applicable test as the API returns it in `reviews`. */
export interface Review {
  testId: string;
  name: string;
  state: "PENDING" | "APPROVED" | "RETURNED";
  current: string;
  rows: number;
  counts: Record<string, number>;
  byName?: string;
  at?: string;
  note?: string;
  stale?: boolean;
  unchanged?: boolean;
}

/** Senior engineer's decision on a test, in plain words. */
export function ReviewBadge({ r }: { r?: Review }) {
  if (!r) return null;
  if (r.state === "APPROVED") return <Badge tone="pass"><Check className="h-3.5 w-3.5" /> Approved</Badge>;
  if (r.state === "RETURNED") return <Badge tone="saffron"><RotateCcw className="h-3.5 w-3.5" /> Sent back for re-test</Badge>;
  if (r.stale) return <Badge tone="cond"><CircleDashed className="h-3.5 w-3.5" /> Changed after approval</Badge>;
  return <Badge tone="slate"><CircleDashed className="h-3.5 w-3.5" /> Waiting for review</Badge>;
}

/** "20 readings · 19 pass · 1 conditional" */
export function rowSummary(r: Review): string {
  const parts = [`${r.rows} reading${r.rows === 1 ? "" : "s"}`];
  const label: Record<string, string> = { PASS: "pass", CONDITIONAL: "conditional", FAIL: "fail", NOT_TESTED: "not entered" };
  for (const k of ["PASS", "CONDITIONAL", "FAIL", "NOT_TESTED"]) if (r.counts?.[k]) parts.push(`${r.counts[k]} ${label[k]}`);
  return parts.join(" · ");
}

export function reviewTotals(reviews: Review[]) {
  const approved = reviews.filter((r) => r.state === "APPROVED").length;
  const sentBack = reviews.filter((r) => r.state === "RETURNED").length;
  const pending = reviews.filter((r) => r.state === "PENDING");
  return {
    total: reviews.length, approved, sentBack,
    passingPending: pending.filter((r) => r.current === "PASS").length,
    needsDecision: pending.filter((r) => r.current === "FAIL" || r.current === "CONDITIONAL").length,
    incomplete: pending.filter((r) => r.current === "NOT_TESTED").length,
  };
}

/** Progress strip at the top of the review: how many tests are approved, and the bulk action. */
export function ReviewProgress({ reviews, status, canAct, onApprovePassing, busy, selected, onSendBack }: {
  reviews: Review[]; status: string; canAct: boolean; onApprovePassing: () => void; busy: boolean; selected: number; onSendBack: () => void;
}) {
  const t = reviewTotals(reviews);
  const lines = [
    t.passingPending ? `${t.passingPending} passing test${t.passingPending > 1 ? "s" : ""} to approve` : "",
    t.needsDecision ? `${t.needsDecision} FAIL / conditional need${t.needsDecision > 1 ? "" : "s"} your decision` : "",
    t.incomplete ? `${t.incomplete} incomplete` : "",
    t.sentBack ? `${t.sentBack} sent back for re-test` : "",
  ].filter(Boolean);
  return (
    <div className="card p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold"><span className="tabular text-2xl font-bold">{t.approved}</span> <span className="text-muted">of {t.total} tests approved</span></p>
          <p className="text-muted mt-0.5 text-xs">{lines.join(" · ") || (t.approved === t.total ? ({ SIGNED: "Every test is approved. The report is signed.", APPROVED: "Every test is approved. The case is ready to sign." } as Record<string, string>)[status] ?? (status === "SUBMITTED" || status === "REVIEWED" ? "Every test is approved. You can approve the case." : "Every test is approved.") : "")}</p>
        </div>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {selected > 0 && <Button size="sm" variant="accent" onClick={onSendBack}><Undo2 className="h-3.5 w-3.5" /> Send back {selected} test{selected > 1 ? "s" : ""}</Button>}
            {t.passingPending > 0 && <Button size="sm" variant="success" loading={busy} onClick={onApprovePassing}><CheckCheck className="h-3.5 w-3.5" /> Approve all passing ({t.passingPending})</Button>}
          </div>
        )}
      </div>
      <ProgressBar className="mt-3" value={t.total ? (t.approved / t.total) * 100 : 0} tone={t.approved === t.total && t.total ? "pass" : "navy"} />
    </div>
  );
}

/**
 * Header row of a test in the review: result, readings summary, decision and the actions.
 * FAIL / CONDITIONAL results need a confirming note to approve (the report will state that result).
 */
export function TestReviewBar({ caseId, r, canAct, sendBackNote, onSendBackNote, onChanged, open, onToggle }: {
  caseId: string; r: Review; canAct: boolean; sendBackNote?: string; onSendBackNote: (text: string | undefined) => void;
  onChanged: () => void; open: boolean; onToggle: () => void;
}) {
  const [mode, setMode] = useState<"approve" | "back" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const needsNote = r.current === "FAIL" || r.current === "CONDITIONAL";
  const call = async (path: string, body?: unknown, ok?: string) => {
    setBusy(true);
    try {
      await api(`/cases/${caseId}/tests/${r.testId}/${path}`, { method: "POST", body: body ?? {} });
      if (ok) toast.success(ok);
      setMode(null);
      setNote("");
      onChanged();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const approve = () => (needsNote ? setMode(mode === "approve" ? null : "approve") : call("approve", {}, `${r.testId} approved`));

  return (
    <div className={cn("border-b border-line", r.state === "APPROVED" && "bg-pass-50/40 dark:bg-pass-500/5", sendBackNote !== undefined && "bg-saffron-50/60 dark:bg-saffron-400/5")}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <button type="button" onClick={onToggle} className="flex min-w-0 items-start gap-2 text-left">
          <ChevronDown className={cn("text-muted mt-1 h-4 w-4 shrink-0 transition", !open && "-rotate-90")} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-semibold"><span className="rounded-md bg-navy-600 px-1.5 py-0.5 font-mono text-[11px] text-white">{r.testId}</span>{r.name}</span>
            <span className="text-muted mt-0.5 block text-xs">
              {rowSummary(r)}
              {r.state === "APPROVED" && r.byName && <> · approved by {r.byName}{r.at ? ` ${ago(r.at)}` : ""}</>}
              {r.note && <> · <i>“{r.note}”</i></>}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge v={r.current} />
          <ReviewBadge r={r} />
          {canAct && r.state !== "APPROVED" && (
            <>
              <Button size="sm" variant={sendBackNote !== undefined ? "accent" : "secondary"} onClick={() => (sendBackNote !== undefined ? onSendBackNote(undefined) : onSendBackNote(""))}>
                <Undo2 className="h-3.5 w-3.5" /> {sendBackNote !== undefined ? "Selected" : "Send back"}
              </Button>
              {r.current !== "NOT_TESTED" && <Button size="sm" variant="success" loading={busy && mode !== "approve"} onClick={approve}><Check className="h-3.5 w-3.5" /> Approve</Button>}
            </>
          )}
          {canAct && r.state === "APPROVED" && <Button size="sm" variant="ghost" loading={busy} onClick={() => call("unapprove", {}, `${r.testId} approval undone`)}>Undo</Button>}
        </div>
      </div>
      {mode === "approve" && (
        <div className="flex flex-col gap-2 px-5 pb-4 sm:flex-row sm:items-start">
          <Textarea className="min-h-14 flex-1" autoFocus value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={`This test is ${r.current === "FAIL" ? "FAIL" : "CONDITIONAL"}. Confirm the readings are correct; the report will state this result.`} />
          <Button variant="success" loading={busy} disabled={note.trim().length < 3} onClick={() => call("approve", { note }, `${r.testId} approved as ${r.current}`)}><Check className="h-4 w-4" /> Confirm result</Button>
        </div>
      )}
      {sendBackNote !== undefined && (
        <div className="px-5 pb-4">
          <Textarea className="min-h-14" autoFocus value={sendBackNote} onChange={(e) => onSendBackNote(e.target.value)} placeholder={`What should the engineer re-test in ${r.testId}?`} />
        </div>
      )}
    </div>
  );
}
