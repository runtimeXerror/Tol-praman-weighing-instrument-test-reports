"use client";

import { evaluateTest, type RulePack, type TestResult, type WeightItem } from "@tolpraman/engine";
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudOff, Eye, FlaskConical, History, Info, Loader2, Lock, MessageSquare, Paperclip, RotateCcw, Ruler, Send, Thermometer, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { ago } from "@/lib/format";
import { formSpec } from "@/lib/forms";
import { useApi, useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge, VerdictBadge, VerdictDot } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody } from "../ui/card";
import { Dialog, ProgressBar, Skeleton, Tabs } from "../ui/misc";
import { InstrumentForm, toProfile } from "./instrument-form";
import { AttachmentsPanel, CommentsPanel, EnvironmentPanel, HistoryPanel, StatusStepper } from "./panels";
import { ScaleBar, ScaleProvider } from "./scale-bar";
import { TestForm } from "./test-form";
import { ReviewBadge, type Review } from "./test-review";

type Tab = "tests" | "instrument" | "environment" | "attachments" | "comments" | "history";
const TIMED: Record<string, { label: string; minutes: number }> = {
  T07b: { label: "Creep", minutes: 30 }, T07a: { label: "Zero return", minutes: 30 }, T11: { label: "Warm-up", minutes: 30 }, T14: { label: "Damp heat", minutes: 2880 }, T15: { label: "Span stability", minutes: 0 }, T19: { label: "Static temperatures", minutes: 480 },
};

export function CaseWorkspace({ id }: { id: string }) {
  return <ScaleProvider><Workspace id={id} /></ScaleProvider>;
}

function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const c = useApi<any>(`/cases/${id}`);
  const packQ = useApi<{ pack: RulePack; hash: string }>(`/cases/${id}/pack`);
  const weightsQ = useApi<any[]>("/admin/weights");
  const readingsQ = useApi<any[]>(`/cases/${id}/readings`);
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "tests");
  const [testId, setTestId] = useState<string>(sp.get("test") || "T01");
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [inst, setInst] = useState<any>(null);
  const [mfr, setMfr] = useState<any>({});
  const [appNo, setAppNo] = useState("");
  const [instDirty, setInstDirty] = useState(false);
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [serverResults, setServerResults] = useState<Record<string, TestResult>>({});
  const [submitOpen, setSubmitOpen] = useState(false);
  /** Returned tests the engineer resubmits without new readings (needs a second click). */
  const [unchanged, setUnchanged] = useState<string[] | null>(null);
  const pending = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const now = useNow(20_000);

  // hydrate local state once per load
  const loadedAt = useRef<string | null>(null);
  useEffect(() => {
    if (!c.data || loadedAt.current === c.data.updatedAt) return;
    loadedAt.current = c.data.updatedAt;
    setInputs((prev) => ({ ...(c.data.testInputs ?? {}), ...Object.fromEntries(Object.entries(prev).filter(([k]) => pending.current[k])) }));
    if (!instDirty) { setInst(c.data.instrument ?? {}); setMfr(c.data.manufacturer ?? {}); setAppNo(c.data.applicationNo ?? ""); }
    setServerResults(Object.fromEntries((c.data.results ?? []).map((r: TestResult) => [r.testId, r])));
  }, [c.data, instDirty]);

  // unsaved-changes warning
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || instDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [instDirty]);

  const pack = packQ.data?.pack;
  const editable = !!c.data && ["DRAFT", "RETURNED"].includes(c.data.status);
  const profile = useMemo(() => (c.data ? (toProfile(c.data.instrument ?? {}) as any) : null), [c.data]);
  const weights: WeightItem[] = useMemo(() => (weightsQ.data ?? []).filter((w) => !w.expired).map((w) => ({ id: w.code, nominal_g: w.nominal_g, class: w.class, conventional_mass_g: w.conventional_mass_g, U_g: w.U_g, cal_due: w.cal_due, certificate: w.certificate })), [weightsQ.data]);
  const applicable: any[] = c.data?.applicable ?? [];
  const valid = !!c.data?.validation?.valid;

  const spec = useMemo(() => (pack && profile && valid ? formSpec(testId, profile, pack) : null), [pack, profile, testId, valid]);
  const value = inputs[testId] ?? (spec ? spec.defaults() : {});
  const live = useMemo(() => {
    if (!pack || !profile || !valid) return null;
    try { return evaluateTest(testId, profile, pack, inputs[testId] ?? null, { rule: c.data?.decisionRule ?? "simple" }); } catch { return null; }
  }, [pack, profile, testId, inputs, valid, c.data?.decisionRule]);
  const server = serverResults[testId];
  // Saved inputs: show the server's (authoritative) result incl. U. While typing: the live browser result.
  const synced = JSON.stringify(inputs[testId] ?? null) === JSON.stringify(c.data?.testInputs?.[testId] ?? null);
  const shown = synced && server ? server : live;

  const save = useCallback(async (tid: string, input: any) => {
    setSaving((s) => ({ ...s, [tid]: "saving" }));
    try {
      // Source of this save: DEVICE if every indication was captured from the scale, MIXED if some were.
      const flat = JSON.stringify(input);
      const captured = flat.match(/"DEVICE"/g)?.length ?? 0;
      const indications = flat.match(/"(I|I1|I2|I_with|I_without)":-?\d/g)?.length ?? 0;
      const source = captured === 0 ? "MANUAL" : captured >= indications ? "DEVICE" : "MIXED";
      const r = await api(`/cases/${id}/tests/${tid}`, { method: "PUT", body: { input, source } });
      setServerResults((m) => ({ ...m, [tid]: r.result }));
      c.setData((d: any) => d ? { ...d, verdict: r.verdict, counts: r.counts, plausibilityFlags: r.plausibilityFlags, testInputs: { ...d.testInputs, [tid]: input }, results: (d.results ?? []).map((x: any) => (x.testId === tid ? r.result : x)) } : d);
      setSaving((s) => ({ ...s, [tid]: "saved" }));
      readingsQ.reload();
    } catch (e) {
      setSaving((s) => ({ ...s, [tid]: "error" }));
      toast.error(errMsg(e));
    } finally {
      delete pending.current[tid];
    }
  }, [id, c, readingsQ]);

  const onChange = (v: any) => {
    setInputs((m) => ({ ...m, [testId]: v }));
    if (pending.current[testId]) clearTimeout(pending.current[testId]);
    const tid = testId;
    setSaving((s) => ({ ...s, [tid]: "saving" }));
    pending.current[tid] = setTimeout(() => save(tid, v), 900);
  };

  const saveInstrument = async () => {
    try {
      const r = await api(`/cases/${id}/instrument`, { method: "PUT", body: { instrument: inst, manufacturer: mfr, applicationNo: appNo } });
      setInstDirty(false);
      if (r.approvalsCleared > 0) toast.warning(`${r.approvalsCleared} approved test${r.approvalsCleared > 1 ? "s" : ""} will be reviewed again: the instrument profile changed, so the limits may have changed.`);
      else toast.success("Instrument profile saved; applicable tests updated");
      c.reload();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const submit = async (confirmUnchanged = false) => {
    try {
      await api(`/cases/${id}/submit`, { method: "POST", body: { confirmUnchanged } });
      toast.success("Submitted to the senior engineer for review");
      setSubmitOpen(false);
      setUnchanged(null);
      c.reload();
    } catch (e: any) {
      const list = e?.details?.unchanged;
      if (Array.isArray(list) && list.length) setUnchanged(list);
      else toast.error(errMsg(e));
    }
  };

  if (c.error) return <Card><CardBody className="text-fail-600">{c.error}</CardBody></Card>;
  if (!c.data || !pack) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;

  const d = c.data;
  const appl = applicable.filter((t) => t.applicable);
  const results: Record<string, TestResult> = serverResults;
  const done = appl.filter((t) => results[t.id] && results[t.id].verdict !== "NOT_TESTED").length;
  const firstEntry = (tid: string) => (readingsQ.data ?? []).filter((r) => r.testId === tid).map((r) => new Date(r.capturedAt).getTime()).sort((a, b) => a - b)[0];
  const returnComments = (d.comments ?? []).filter((x: any) => x.kind === "return" && !x.resolved);
  const testComments = (tid: string) => (d.comments ?? []).filter((x: any) => x.testId === tid && !x.resolved);
  const curApp = applicable.find((t) => t.id === testId);
  const reviews: Review[] = d.reviews ?? [];
  const reviewOf = (tid: string) => reviews.find((r) => r.testId === tid);
  const reviewed = d.status === "RETURNED" && reviews.some((r) => r.state !== "PENDING" || r.stale);
  const sentBack = reviews.filter((r) => r.state === "RETURNED");
  /** After review, approved tests are locked; only the tests sent back (or not yet approved) can be changed. */
  const testEditable = (tid: string) => editable && !(d.status === "RETURNED" && reviewOf(tid)?.state === "APPROVED");

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="overflow-hidden animate-slide-up">
        <div className="relative bg-gradient-to-r from-navy-700 via-navy-600 to-navy-500 px-5 py-5 text-white md:px-6">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <button onClick={() => router.back()} className="mb-2 inline-flex items-center gap-1 text-xs text-navy-100 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold md:text-2xl">{d.caseNo}</h1>
                <StatusBadge s={d.status} />
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">{d.profile === "IN" ? "LM (G) Rules 2011" : "OIML R 76"}</span>
                {d.revision > 0 && <span className="rounded-full bg-saffron-400 px-2 py-0.5 text-[11px] font-bold text-navy-950">Revision {d.revision}</span>}
                {d.priority === "urgent" && <span className="rounded-full bg-saffron-400 px-2 py-0.5 text-[11px] font-bold text-navy-950">URGENT</span>}
              </div>
              <p className="mt-1 text-sm text-navy-100">{d.title}</p>
              <p className="mt-0.5 text-xs text-navy-200">{d.manufacturer?.name} · App. {d.applicationNo ?? "—"} · Standard v{d.rulepackVersion}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="surface flex min-w-[168px] flex-col items-center gap-1.5 rounded-2xl px-5 py-2.5 text-center text-[var(--text)] shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                <p className="text-[10.5px] font-semibold uppercase leading-none tracking-wider text-navy-500 dark:text-navy-300">Overall result</p>
                <VerdictBadge v={d.verdict} size="lg" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20 hover:text-white" onClick={() => window.open(`/preview/${id}`, "_blank")}><Eye className="h-3.5 w-3.5" /> Preview report</Button>
                {editable && (
                  <Button size="sm" variant="accent" onClick={() => setSubmitOpen(true)}><Send className="h-3.5 w-3.5" /> Submit</Button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_280px] md:px-6">
          <StatusStepper status={d.status} twoLevel={d.lab?.twoLevelApproval} />
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Applicable tests completed</span><span className="font-semibold">{done}/{appl.length}</span></div>
            <ProgressBar value={appl.length ? (done / appl.length) * 100 : 0} tone={done === appl.length ? "pass" : "navy"} />
          </div>
        </div>
      </Card>

      {reviewed && sentBack.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-saffron-300 bg-saffron-50 p-4 text-sm dark:border-saffron-700/40 dark:bg-saffron-700/10 animate-slide-up">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
          <div className="min-w-0">
            <p className="font-semibold text-saffron-700 dark:text-saffron-300">Re-test {sentBack.length} test{sentBack.length > 1 ? "s" : ""}, then submit again</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sentBack.map((r) => <button key={r.testId} onClick={() => { setTab("tests"); setTestId(r.testId); }} className="rounded-full bg-saffron-400 px-2.5 py-0.5 text-xs font-bold text-navy-950 hover:bg-saffron-500">{r.testId} · {r.name}</button>)}
            </div>
            <p className="text-muted mt-1.5 text-xs">Tests the senior engineer approved are locked. Changing the class, Max, Min or e sends all tests back for review.</p>
          </div>
        </div>
      )}
      {d.status === "RETURNED" && returnComments.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-saffron-300 bg-saffron-50 p-4 text-sm dark:border-saffron-700/40 dark:bg-saffron-700/10 animate-slide-up">
          <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
          <div className="min-w-0">
            <p className="font-semibold text-saffron-700 dark:text-saffron-300">Returned by the senior engineer</p>
            {returnComments.map((x: any) => <p key={x._id} className="mt-1">{x.testId && <Badge tone="navy" className="mr-1">{x.testId}</Badge>}{x.text} <span className="text-muted text-xs">— {x.author?.name}, {ago(x.createdAt)}</span></p>)}
          </div>
        </div>
      )}
      {(d.plausibilityFlags ?? []).length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-cond-100 bg-cond-50 p-4 text-sm dark:border-cond-700/30 dark:bg-cond-700/10">
          <Timer className="mt-0.5 h-5 w-5 shrink-0 text-cond-600" />
          <div><p className="font-semibold text-cond-700 dark:text-cond-100">Timing check</p>{d.plausibilityFlags.map((f: any) => <p key={f.testId} className="mt-0.5">{f.message}</p>)}</div>
        </div>
      )}
      {!valid && (
        <div className="flex gap-3 rounded-2xl border border-navy-200 bg-navy-50 p-4 text-sm dark:border-navy-800 dark:bg-navy-900/30">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" />
          <div><p className="font-semibold">Complete the instrument profile first</p><p className="text-muted">Test forms are generated from the class, Max, Min and e. <button className="font-medium text-navy-600 underline" onClick={() => setTab("instrument")}>Open instrument profile</button></p></div>
        </div>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={(t) => { if (tab === "instrument" && instDirty && !confirm("Discard unsaved instrument changes?")) return; setTab(t); }}
        tabs={[
          { id: "tests", label: <><FlaskConical className="h-3.5 w-3.5" /> Tests</>, count: `${done}/${appl.length}` },
          { id: "instrument", label: <><Ruler className="h-3.5 w-3.5" /> Instrument</> },
          { id: "environment", label: <><Thermometer className="h-3.5 w-3.5" /> Environment</>, count: d.sessions?.length ?? 0 },
          { id: "attachments", label: <><Paperclip className="h-3.5 w-3.5" /> Attachments</>, count: d.attachments?.length ?? 0 },
          { id: "comments", label: <><MessageSquare className="h-3.5 w-3.5" /> Comments</>, count: d.comments?.length ?? 0 },
          { id: "history", label: <><History className="h-3.5 w-3.5" /> History</>, count: d.readingsCount },
        ]}
      />

      {tab === "tests" && (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[272px_minmax(0,1fr)]">
          {/* Test list */}
          <Card className="min-w-0 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100dvh-3rem)] 2xl:self-start 2xl:overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">R 76 test programme</p>
              <p className="text-muted text-xs">{appl.length} applicable of {applicable.length}</p>
            </div>
            <div className="scrollbar-thin flex gap-1.5 overflow-x-auto p-2 2xl:block 2xl:max-h-[calc(100dvh-9rem)] 2xl:overflow-y-auto 2xl:overflow-x-hidden">
              {applicable.map((t) => {
                const r = results[t.id];
                const active = t.id === testId;
                const s = saving[t.id];
                const tc = testComments(t.id).length;
                return (
                  <button key={t.id} onClick={() => setTestId(t.id)} title={t.applicable ? t.clause : t.reasons.join("; ")}
                    className={cn("flex w-60 shrink-0 items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition 2xl:w-full", active ? "bg-navy-600 text-white shadow-md" : "hover:bg-navy-50 dark:hover:bg-white/5", !t.applicable && !active && "opacity-50")}>
                    <span className="mt-1"><VerdictDot v={t.applicable ? r?.verdict : "NOT_APPLICABLE"} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <span className={cn("font-mono text-[11px]", active ? "text-navy-200" : "text-muted")}>{t.id}</span>
                        <span className="truncate">{t.name}</span>
                      </span>
                      <span className={cn("block truncate text-[11px]", active ? "text-navy-200" : "text-muted")}>{t.applicable ? t.clause : "N/A · " + t.reasons[0]}</span>
                    </span>
                    {reviewed && reviewOf(t.id)?.state === "APPROVED" && <Lock className={cn("mt-1 h-3.5 w-3.5 shrink-0", active ? "text-navy-200" : "text-pass-600")} aria-label="Approved and locked" />}
                    {reviewed && reviewOf(t.id)?.state === "RETURNED" && <span className="mt-0.5 rounded-full bg-saffron-400 px-1.5 text-[10px] font-bold text-navy-950">Re-test</span>}
                    {tc > 0 && !(reviewed && reviewOf(t.id)?.state === "RETURNED") && <span className="mt-0.5 rounded-full bg-saffron-400 px-1.5 text-[10px] font-bold text-navy-950">{tc}</span>}
                    {s === "saving" && <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin opacity-70" />}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Test entry */}
          <div className="min-w-0 space-y-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-navy-600 px-2 py-0.5 font-mono text-xs font-bold text-white">{testId}</span>
                    <h2 className="text-lg font-semibold">{curApp?.name}</h2>
                  </div>
                  <p className="text-muted mt-1 text-xs">Clause <span className="font-medium text-[var(--text)]">{curApp?.clause}</span>{pack.tests.find((t) => t.id === testId)?.report_section && <> · Report format {pack.tests.find((t) => t.id === testId)?.report_section}</>}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {TIMED[testId] && firstEntry(testId) && (
                    <Badge tone="navy"><Timer className="h-3.5 w-3.5" /> {TIMED[testId].label}: {Math.floor((now - firstEntry(testId)!) / 60000)} min since first entry{TIMED[testId].minutes ? ` · rule ${TIMED[testId].minutes >= 1440 ? `${TIMED[testId].minutes / 1440} d` : `${TIMED[testId].minutes} min`}` : ""}</Badge>
                  )}
                  <SaveState s={saving[testId]} />
                  {reviewed && <ReviewBadge r={reviewOf(testId)} />}
                  {curApp?.applicable && <VerdictBadge v={shown?.verdict} size="lg" />}
                </div>
              </div>
              <CardBody>
                {!curApp?.applicable ? (
                  <div className="flex gap-3 rounded-xl surface-2 p-4 text-sm"><Info className="text-muted h-5 w-5" /><div><p className="font-semibold">Not applicable to this instrument</p><p className="text-muted">{curApp?.reasons.join("; ")}</p></div></div>
                ) : !spec ? (
                  <p className="text-muted text-sm">Complete the instrument profile to generate this form.</p>
                ) : (
                  <div className="space-y-4">
                    {reviewed && reviewOf(testId)?.state === "APPROVED" && (
                      <div className="flex gap-2 rounded-xl bg-pass-50 p-3 text-sm dark:bg-pass-500/10"><Lock className="h-4 w-4 shrink-0 text-pass-600" /><span>Approved by {reviewOf(testId)?.byName ?? "the senior engineer"}. This test is locked.</span></div>
                    )}
                    {testEditable(testId) && <ScaleBar d_g={profile?.d_g ?? 1} />}
                    {testComments(testId).map((x: any) => (
                      <div key={x._id} className="flex gap-2 rounded-xl bg-saffron-50 p-3 text-sm dark:bg-saffron-700/10"><MessageSquare className="h-4 w-4 shrink-0 text-saffron-600" /><span><b>{x.author?.name}:</b> {x.text}</span></div>
                    ))}
                    <TestForm testId={testId} spec={spec} value={value} onChange={onChange} result={shown ?? null} inst={profile} pack={pack} weights={weights} readOnly={!testEditable(testId)} />
                    {shown?.notes?.length ? (
                      <div className="rounded-xl bg-navy-50/70 p-3 text-xs dark:bg-white/5">{shown.notes.map((n) => <p key={n} className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-500" />{n}</p>)}</div>
                    ) : null}
                    {!inputs[testId] && testEditable(testId) && <p className="text-muted text-xs">Defaults pre-filled from the instrument (Min, mpe change points, Max). Enter readings to start; changes save automatically.</p>}
                  </div>
                )}
              </CardBody>
            </Card>
            <p className="text-muted flex items-center gap-1.5 text-xs"><CheckCircle2 className="h-3.5 w-3.5 text-pass-600" /> Results update as you type and are checked again when saved. The saved result is the final one.</p>
          </div>
        </div>
      )}

      {tab === "instrument" && inst && (
        <div className="space-y-4">
          <InstrumentForm pack={pack} inst={inst} readOnly={!editable} onChange={(x) => { setInst(x); setInstDirty(true); }} manufacturer={mfr} onManufacturer={(m) => { setMfr(m); setInstDirty(true); }} applicationNo={appNo} onApplicationNo={(s) => { setAppNo(s); setInstDirty(true); }} />
          {editable && (
            <div className="sticky bottom-4 z-20 flex items-center justify-end gap-3 rounded-2xl border border-line surface p-3 shadow-lift">
              {instDirty && <span className="text-sm text-cond-600">Unsaved changes</span>}
              <Button variant="secondary" disabled={!instDirty} onClick={() => { setInst(d.instrument ?? {}); setMfr(d.manufacturer ?? {}); setAppNo(d.applicationNo ?? ""); setInstDirty(false); }}>Discard</Button>
              <Button disabled={!instDirty} onClick={saveInstrument}>Save instrument profile</Button>
            </div>
          )}
        </div>
      )}
      {tab === "environment" && <EnvironmentPanel caseId={id} sessions={d.sessions ?? []} editable={editable} tempRange={[d.instrument?.tempLow_C ?? -10, d.instrument?.tempHigh_C ?? 40]} onChange={c.reload} />}
      {tab === "attachments" && <AttachmentsPanel caseId={id} attachments={d.attachments ?? []} editable={editable} onChange={c.reload} />}
      {tab === "comments" && <CommentsPanel caseId={id} comments={d.comments ?? []} onChange={c.reload} canComment />}
      {tab === "history" && <HistoryPanel caseId={id} rulepackHash={d.rulepackHash} rulepackVersion={`${pack.id} v${pack.version}`} />}

      <Dialog open={submitOpen} onClose={() => { setSubmitOpen(false); setUnchanged(null); }} wide title="Check and submit for review"
        subtitle={`Every test below was checked by the rule engine against ${d.profile === "IN" ? "LM (General) Rules 2011, Heading A" : "OIML R 76"}. Data entry closes until the senior engineer decides.`}
        footer={unchanged ? (
          <><Button variant="secondary" onClick={() => setUnchanged(null)}>Go back and re-test</Button><Button variant="accent" onClick={() => submit(true)}><Send className="h-4 w-4" /> Submit anyway</Button></>
        ) : (
          <><Button variant="secondary" onClick={() => setSubmitOpen(false)}>Cancel</Button><Button disabled={!d.readiness?.ready} onClick={() => submit(false)}><Send className="h-4 w-4" /> Submit</Button></>
        )}>
        {unchanged ? (
          <div className="flex gap-3 rounded-xl bg-cond-50 p-4 text-sm dark:bg-cond-500/10">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-cond-600" />
            <p><b>{unchanged.join(", ")}</b> {unchanged.length > 1 ? "were" : "was"} sent back for re-test but no readings changed. Submit anyway only if the senior engineer asked for something else (e.g. a photograph).</p>
          </div>
        ) : d.readiness?.ready ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              {(["PASS", "CONDITIONAL", "FAIL"] as const).map((k) => <div key={k} className="rounded-xl surface-2 p-3"><p className="tabular text-2xl font-bold">{d.counts?.[k] ?? 0}</p><VerdictBadge v={k} /></div>)}
            </div>
            <div className="scrollbar-thin max-h-72 overflow-y-auto rounded-xl border border-line">
              {appl.map((t) => {
                const r = results[t.id];
                const rv = reviewOf(t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-0">
                    <span className="min-w-0 truncate"><span className="text-muted mr-2 font-mono text-xs">{t.id}</span>{t.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">{reviewed && rv?.state === "APPROVED" ? <ReviewBadge r={rv} /> : null}<VerdictBadge v={r?.verdict} /></span>
                  </div>
                );
              })}
            </div>
            {(d.counts?.FAIL ?? 0) + (d.counts?.CONDITIONAL ?? 0) > 0 && <p className="text-muted text-xs">FAIL or conditional results are not an error if the readings are correct: the senior engineer decides whether to accept them or ask for a re-test.</p>}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Not ready yet:</p>
            {(d.readiness?.blockers ?? []).map((b: string) => <p key={b} className="flex gap-2 text-fail-700 dark:text-fail-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{b}</p>)}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function SaveState({ s }: { s?: "saving" | "saved" | "error" }) {
  if (!s) return null;
  if (s === "saving") return <span className="text-muted inline-flex items-center gap-1 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>;
  if (s === "error") return <span className="inline-flex items-center gap-1 text-xs text-fail-600"><CloudOff className="h-3.5 w-3.5" /> Not saved</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-pass-600"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>;
}

