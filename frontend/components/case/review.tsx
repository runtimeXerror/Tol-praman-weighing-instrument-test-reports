"use client";

import type { RulePack, TestResult } from "@tolpraman/engine";
import { ArrowLeft, BadgeCheck, CheckCheck, ExternalLink, Eye, FileDown, FileText, History, Lock, MessageSquare, Paperclip, PenLine, RotateCcw, Ruler, ShieldOff, Timer, Undo2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, download, errMsg } from "@/lib/api";
import { ago, date } from "@/lib/format";
import { formSpec } from "@/lib/forms";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge, VerdictBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody } from "../ui/card";
import { Field, Textarea } from "../ui/form";
import { Dialog, Skeleton, Tabs } from "../ui/misc";
import { InstrumentForm, toProfile } from "./instrument-form";
import { AttachmentsPanel, CommentsPanel, HistoryPanel, StatusStepper } from "./panels";
import { ReportPreview } from "./report-preview";
import { SignDialog } from "./sign-dialog";
import { TestForm } from "./test-form";
import { reviewTotals, ReviewProgress, TestReviewBar, type Review } from "./test-review";

type Tab = "results" | "preview" | "instrument" | "attachments" | "comments" | "history";
type Filter = "all" | "decide" | "approved" | "back";

export function ReviewScreen({ id, readOnly }: { id: string; readOnly?: boolean }) {
  const router = useRouter();
  const c = useApi<any>(`/cases/${id}`);
  const packQ = useApi<{ pack: RulePack }>(`/cases/${id}/pack`);
  const [tab, setTab] = useState<Tab>("results");
  const [filter, setFilter] = useState<Filter>("all");
  /** Tests selected to send back, with the note for each. */
  const [back, setBack] = useState<Record<string, string>>({});
  const [openTests, setOpenTests] = useState<Record<string, boolean>>({});
  const [dlg, setDlg] = useState<"return" | "approve" | "review" | "sign" | "revoke" | "reopen" | null>(null);
  const [text, setText] = useState("");
  const [reopenTests, setReopenTests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pack = packQ.data?.pack;
  const d = c.data;
  const profile = useMemo(() => (d ? (toProfile(d.instrument ?? {}) as any) : null), [d]);

  if (c.error) return <Card><CardBody className="text-fail-600">{c.error}</CardBody></Card>;
  if (!d || !pack) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;

  const results: TestResult[] = d.results ?? [];
  const reviews: Review[] = d.reviews ?? [];
  const totals = reviewTotals(reviews);
  const allApproved = totals.total > 0 && totals.approved === totals.total;
  const twoLevel = !!d.lab?.twoLevelApproval;
  const canAct = !readOnly && d.status === "SUBMITTED";
  const canReturn = !readOnly && ["SUBMITTED", "REVIEWED"].includes(d.status);
  const selected = Object.keys(back);
  const shown = reviews.filter((r) =>
    filter === "all" ? true : filter === "approved" ? r.state === "APPROVED" : filter === "back" ? r.state === "RETURNED" || back[r.testId] !== undefined : r.state !== "APPROVED");
  const isOpen = (r: Review) => openTests[r.testId] ?? (r.state !== "APPROVED" && (r.current === "FAIL" || r.current === "CONDITIONAL"));

  const act = async (path: string, body?: unknown, ok?: string) => {
    setBusy(true);
    try {
      await api(`/cases/${id}/${path}`, { method: "POST", body: body ?? {} });
      toast.success(ok ?? "Done");
      setDlg(null);
      setText("");
      if (path === "return") setBack({});
      if (path === "reopen") setReopenTests([]);
      c.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const backList = Object.entries(back).map(([testId, t]) => ({ testId, text: t.trim() }));
  const backIncomplete = backList.some((b) => b.text.length < 3);
  const ghostOnDark = "bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20 hover:text-white";

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden animate-slide-up">
        <div className="relative bg-gradient-to-r from-navy-800 via-navy-700 to-violet-800 px-5 py-5 text-white md:px-6">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <button onClick={() => router.back()} className="mb-2 inline-flex items-center gap-1 text-xs text-navy-100 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold md:text-2xl">{d.caseNo}</h1>
                <StatusBadge s={d.status} />
                {d.revision > 0 && <span className="rounded-full bg-saffron-400 px-2 py-0.5 text-[11px] font-bold text-navy-950">Revision {d.revision}</span>}
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">{d.profile === "IN" ? "LM (G) Rules 2011" : "OIML R 76"} · Standard v{d.rulepackVersion}</span>
              </div>
              <p className="mt-1 text-sm text-navy-100">{d.title}</p>
              <p className="mt-0.5 text-xs text-navy-200">{d.manufacturer?.name} · Engineer {d.assignedEngineer?.name}{d.submittedAt && ` · submitted ${ago(d.submittedAt)}`}</p>
              {d.receipt?.receivedAt && <p className="mt-0.5 text-xs text-navy-200">Received {date(d.receipt.receivedAt)}{d.receipt.sampleNo ? ` · sample ${d.receipt.sampleNo}` : ""}{d.receipt.condition && d.receipt.condition !== "good" ? ` · ${d.receipt.condition}: ${d.receipt.notes ?? ""}` : ""}{d.createdBy?.name ? ` · by ${d.createdBy.name}` : ""}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="surface flex min-w-[168px] flex-col items-center gap-1.5 rounded-2xl px-5 py-2.5 text-center text-[var(--text)] shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                <p className="text-[10.5px] font-semibold uppercase leading-none tracking-wider text-navy-500 dark:text-navy-300">Overall result</p>
                <VerdictBadge v={d.verdict} size="lg" />
              </div>
              {!readOnly && (
                <div className="flex flex-wrap justify-end gap-2">
                  {canReturn && <Button size="sm" variant="ghost" className={ghostOnDark} onClick={() => setDlg("return")}><Undo2 className="h-3.5 w-3.5" /> Send back{selected.length ? ` (${selected.length})` : ""}</Button>}
                  {d.status === "SUBMITTED" && twoLevel && <Button size="sm" variant="accent" disabled={!allApproved} title={allApproved ? undefined : "Approve every test first"} onClick={() => setDlg("review")}><UserCheck className="h-3.5 w-3.5" /> Mark reviewed</Button>}
                  {((d.status === "SUBMITTED" && !twoLevel) || d.status === "REVIEWED") && <Button size="sm" variant="success" disabled={!allApproved} title={allApproved ? undefined : "Approve every test first"} onClick={() => setDlg("approve")}><CheckCheck className="h-3.5 w-3.5" /> Approve case</Button>}
                  {d.status === "APPROVED" && <Button size="sm" variant="accent" onClick={() => setDlg("sign")}><PenLine className="h-3.5 w-3.5" /> Sign & lock</Button>}
                  {d.status === "SIGNED" && d.report && (
                    <>
                      <Button size="sm" variant="accent" onClick={() => download(`/reports/${d.report._id}/pdf`, "", true)}><FileDown className="h-3.5 w-3.5" /> PDF</Button>
                      <Button size="sm" variant="ghost" className={ghostOnDark} onClick={() => download(`/reports/${d.report._id}/docx`, `${d.report.reportNo.replace(/\//g, "-")}.docx`)}><FileText className="h-3.5 w-3.5" /> Word</Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:px-6">
          <StatusStepper status={d.status} twoLevel={twoLevel} />
          <div className="flex gap-4 text-center text-xs">
            {(["PASS", "CONDITIONAL", "FAIL"] as const).map((k) => <div key={k}><p className="tabular text-xl font-bold">{d.counts?.[k] ?? 0}</p><VerdictBadge v={k} /></div>)}
          </div>
        </div>
      </Card>

      {d.status === "SIGNED" && d.report && (
        <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-4 text-sm", d.report.revoked ? "border-fail-200 bg-fail-50 dark:bg-fail-700/10" : "border-pass-100 bg-pass-50 dark:bg-pass-700/10")}>
          {d.report.revoked ? <ShieldOff className="h-5 w-5 text-fail-600" /> : <BadgeCheck className="h-5 w-5 text-pass-600" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{d.report.revoked ? `Report ${d.report.reportNo} REVOKED` : `Report ${d.report.reportNo}${d.report.revision ? ` (revision ${d.report.revision})` : ""} signed ${date(d.report.signedAt, true)}`}</p>
            <p className="text-muted break-all font-mono text-[11px]">Digital fingerprint {d.report.sha256.slice(0, 16)}…</p>
            {d.report.revoked && <p className="text-fail-700">Reason: {d.report.revokeReason}</p>}
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.open(`/verify/${d.report.verifyId}`, "_blank")}><ExternalLink className="h-3.5 w-3.5" /> Verify page</Button>
          {!readOnly && <Button size="sm" variant="secondary" onClick={() => setDlg("reopen")}><RotateCcw className="h-3.5 w-3.5" /> Reopen for re-test</Button>}
          {!readOnly && !d.report.revoked && <Button size="sm" variant="danger" onClick={() => setDlg("revoke")}><ShieldOff className="h-3.5 w-3.5" /> Revoke</Button>}
        </div>
      )}
      {d.status !== "SIGNED" && d.report?.underRevision && (
        <div className="flex gap-3 rounded-2xl border border-saffron-200 bg-saffron-50 p-4 text-sm dark:border-saffron-700/30 dark:bg-saffron-400/10">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
          <p>Revision {d.revision} in progress. Report <b>{d.report.reportNo}</b> stays valid until the revised report is signed, which will supersede it.{d.report.revisionReason ? <> Reason: {d.report.revisionReason}</> : null}</p>
        </div>
      )}
      {(d.plausibilityFlags ?? []).length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-cond-100 bg-cond-50 p-4 text-sm dark:border-cond-700/30 dark:bg-cond-700/10">
          <Timer className="mt-0.5 h-5 w-5 shrink-0 text-cond-600" />
          <div><p className="font-semibold text-cond-700 dark:text-cond-100">Timing check (look at this before approving)</p>{d.plausibilityFlags.map((f: any) => <p key={f.testId}>{f.message}</p>)}</div>
        </div>
      )}
      {["DRAFT", "RETURNED"].includes(d.status) && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line surface p-4 text-sm">
          <Lock className="text-muted h-5 w-5" />
          <span className="flex-1">With <b>{d.assignedEngineer?.name}</b> for {d.status === "RETURNED" ? "re-test" : "testing"}.{readOnly ? "" : " You can review once it is submitted."}</span>
        </div>
      )}

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "results", label: <><CheckCheck className="h-3.5 w-3.5" /> Test results</>, count: `${totals.approved}/${totals.total}` },
        { id: "preview", label: <><Eye className="h-3.5 w-3.5" /> Report preview</> },
        { id: "instrument", label: <><Ruler className="h-3.5 w-3.5" /> Instrument</> },
        { id: "attachments", label: <><Paperclip className="h-3.5 w-3.5" /> Attachments</>, count: d.attachments?.length ?? 0 },
        { id: "comments", label: <><MessageSquare className="h-3.5 w-3.5" /> Comments</>, count: d.comments?.length ?? 0 },
        { id: "history", label: <><History className="h-3.5 w-3.5" /> History</>, count: d.readingsCount },
      ]} />

      {tab === "results" && (
        <div className="space-y-4">
          <ReviewProgress reviews={reviews} status={d.status} canAct={canAct} busy={busy} selected={selected.length} onSendBack={() => setDlg("return")}
            onApprovePassing={() => act("tests/approve-passing", {}, "Passing tests approved")} />
          <Tabs<Filter> value={filter} onChange={setFilter} tabs={[
            { id: "all", label: "All tests", count: totals.total },
            { id: "decide", label: "Not approved", count: totals.total - totals.approved },
            { id: "approved", label: "Approved", count: totals.approved },
            { id: "back", label: "Sent back", count: totals.sentBack + selected.filter((k) => reviews.find((r) => r.testId === k)?.state !== "RETURNED").length },
          ]} />
          {shown.map((r) => {
            const res = results.find((x) => x.testId === r.testId) ?? null;
            const spec = profile && d.validation?.valid ? formSpec(r.testId, profile, pack) : null;
            const open = isOpen(r);
            return (
              <Card key={r.testId} className={cn("overflow-hidden", r.current === "FAIL" && r.state !== "APPROVED" && "ring-1 ring-fail-500/30", r.current === "CONDITIONAL" && r.state !== "APPROVED" && "ring-1 ring-cond-500/40")}>
                <TestReviewBar caseId={id} r={r} canAct={canAct} open={open} onToggle={() => setOpenTests({ ...openTests, [r.testId]: !open })}
                  sendBackNote={back[r.testId]} onChanged={c.reload}
                  onSendBackNote={(t) => setBack((b) => { const n = { ...b }; if (t === undefined) delete n[r.testId]; else n[r.testId] = t; return n; })} />
                {open && (
                  <CardBody>
                    {spec && d.testInputs?.[r.testId] ? (
                      <TestForm testId={r.testId} spec={{ ...spec, intro: undefined }} value={d.testInputs[r.testId]} onChange={() => {}} result={res} inst={profile} pack={pack} weights={[]} readOnly />
                    ) : <p className="text-muted text-sm">No data recorded.</p>}
                    {res?.notes?.length ? <p className="text-muted mt-3 text-xs">{res.notes.join(" ")}</p> : null}
                  </CardBody>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {tab === "preview" && <ReportPreview caseId={id} />}
      {tab === "instrument" && <InstrumentForm pack={pack} inst={d.instrument ?? {}} readOnly onChange={() => {}} manufacturer={d.manufacturer ?? {}} onManufacturer={() => {}} applicationNo={d.applicationNo} onApplicationNo={() => {}} />}
      {tab === "attachments" && <AttachmentsPanel caseId={id} attachments={d.attachments ?? []} editable={false} onChange={c.reload} />}
      {tab === "comments" && <CommentsPanel caseId={id} comments={d.comments ?? []} onChange={c.reload} canComment={!readOnly} />}
      {tab === "history" && <HistoryPanel caseId={id} rulepackHash={d.rulepackHash} rulepackVersion={`${pack.id} v${pack.version}`} />}

      <Dialog open={dlg === "return"} onClose={() => setDlg(null)} title="Send back to the engineer"
        subtitle={selected.length ? "Only the tests below reopen for re-test. Approved tests stay locked." : "Select tests with “Send back” on each test, or write a general comment."}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant="accent" loading={busy}
          disabled={backIncomplete || (!selected.length && text.trim().length < 3)}
          onClick={() => act("return", { comment: text.trim() || undefined, testComments: backList }, "Sent back to the engineer")}><Undo2 className="h-4 w-4" /> Send back</Button></>}>
        {selected.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {backList.map((b) => <p key={b.testId} className="text-sm"><Badge tone="saffron">{b.testId}</Badge> {b.text || <span className="text-fail-600">Write what to re-test (on the test card)</span>}</p>)}
          </div>
        )}
        <Field label={selected.length ? "General comment (optional)" : "Comment for the engineer"}><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Attach the level indicator photograph" /></Field>
      </Dialog>
      <Dialog open={dlg === "approve" || dlg === "review"} onClose={() => setDlg(null)} title={dlg === "review" ? "Mark as reviewed" : "Approve case"}
        subtitle={dlg === "review" ? "Two-level approval: a second senior engineer must approve." : "Every test is approved. Results are checked again by the rule engine before approval."}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant="success" loading={busy} onClick={() => act(dlg!, { comment: text || undefined }, dlg === "review" ? "Marked reviewed" : "Case approved")}><CheckCheck className="h-4 w-4" /> {dlg === "review" ? "Reviewed" : "Approve"}</Button></>}>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">{(["PASS", "CONDITIONAL", "FAIL"] as const).map((k) => <div key={k} className="rounded-xl surface-2 p-3"><p className="tabular text-2xl font-bold">{d.counts?.[k] ?? 0}</p><VerdictBadge v={k} /></div>)}</div>
        <Field label="Comment (optional)"><Textarea className="min-h-16" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      </Dialog>
      <Dialog open={dlg === "reopen"} onClose={() => setDlg(null)} wide title="Reopen for re-test"
        subtitle={`Choose the tests to repeat. ${d.report?.reportNo ?? "The report"} stays valid until the revised report is signed; the new report will say it supersedes it.`}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant="accent" loading={busy} disabled={text.trim().length < 10 || !reopenTests.length}
          onClick={() => act("reopen", { reason: text.trim(), testComments: reopenTests.map((t) => ({ testId: t, text: `Re-test: ${text.trim()}` })) }, "Reopened. The engineer can re-test the selected tests.")}><RotateCcw className="h-4 w-4" /> Reopen</Button></>}>
        <Field label="Reason for the revision" hint="At least 10 characters. Shown on the revised report."><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Customer reported zero drift; repeat creep and zero return" /></Field>
        <p className="mb-2 mt-4 text-sm font-semibold">Tests to repeat <span className="text-muted font-normal">({reopenTests.length} selected)</span></p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {reviews.map((r) => {
            const on = reopenTests.includes(r.testId);
            return (
              <label key={r.testId} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition", on ? "border-saffron-400 bg-saffron-50 dark:bg-saffron-400/10" : "border-line hover:bg-navy-50/50 dark:hover:bg-white/5")}>
                <input type="checkbox" checked={on} onChange={() => setReopenTests(on ? reopenTests.filter((x) => x !== r.testId) : [...reopenTests, r.testId])} className="accent-saffron-500" />
                <span className="font-mono text-xs font-semibold">{r.testId}</span><span className="truncate">{r.name}</span>
              </label>
            );
          })}
        </div>
      </Dialog>
      <Dialog open={dlg === "revoke"} onClose={() => setDlg(null)} title="Revoke report" subtitle="The verification page will show REVOKED with your reason. The signed PDF is kept for the record."
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant="danger" loading={busy} disabled={text.trim().length < 5} onClick={async () => { setBusy(true); try { await api(`/reports/${d.report._id}/revoke`, { body: { reason: text } }); toast.success("Report revoked"); setDlg(null); setText(""); c.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } }}><ShieldOff className="h-4 w-4" /> Revoke</Button></>}>
        <Field label="Reason"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Wrong serial number printed on the report" /></Field>
      </Dialog>
      <SignDialog c={d.status === "APPROVED" ? { ...d, id } : null} open={dlg === "sign"} onClose={() => setDlg(null)} onDone={c.reload} />
    </div>
  );
}
