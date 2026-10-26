"use client";

import { AlertTriangle, Check, CheckCircle2, FileText, Image as ImageIcon, Link2, Lock, MessageSquare, Paperclip, Send, ShieldAlert, ShieldCheck, Thermometer, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { ago, date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Field, NumberInput, Select, Textarea } from "../ui/form";
import { EmptyState, td, th, TableWrap } from "../ui/misc";

const STEPS = [
  { key: "DRAFT", label: "Data entry" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "APPROVED", label: "Approved" },
  { key: "SIGNED", label: "Signed & locked" },
];

export function StatusStepper({ status, twoLevel }: { status: string; twoLevel?: boolean }) {
  const steps = twoLevel ? [STEPS[0], STEPS[1], { key: "REVIEWED", label: "Reviewed" }, STEPS[2], STEPS[3]] : STEPS;
  const idx = status === "RETURNED" ? 0 : Math.max(0, steps.findIndex((s) => s.key === status));
  return (
    <ol className="flex w-full items-center">
      {steps.map((s, i) => {
        const done = i < idx || status === "SIGNED";
        const cur = i === idx && status !== "SIGNED";
        return (
          <li key={s.key} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
            <div className="flex items-center gap-2">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ring-2",
                done ? "bg-pass-600 text-white ring-pass-600" : cur ? (status === "RETURNED" ? "bg-saffron-400 text-navy-950 ring-saffron-400" : "bg-navy-600 text-white ring-navy-600") : "surface text-muted ring-[var(--border)]")}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="hidden leading-tight md:block">
                <span className={cn("block text-xs font-semibold", !done && !cur && "text-muted")}>{i === 0 && status === "RETURNED" ? "Returned — fix" : s.label}</span>
              </span>
            </div>
            {i < steps.length - 1 && <div className={cn("mx-2 h-0.5 flex-1 rounded", done ? "bg-pass-500" : "bg-[var(--border)]")} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Environment ---------------- */

export function EnvironmentPanel({ caseId, sessions, editable, tempRange, onChange }: { caseId: string; sessions: any[]; editable: boolean; tempRange: [number, number]; onChange: () => void }) {
  const eq = useApi<any[]>("/admin/equipment");
  const wt = useApi<any[]>("/admin/weights");
  const [f, setF] = useState<{ T_C: number | null; RH_pct: number | null; p_hPa: number | null; testId: string; equipmentUsed: string[]; weightsUsed: string[]; notes: string }>({ T_C: null, RH_pct: null, p_hPa: null, testId: "", equipmentUsed: [], weightsUsed: [], notes: "" });
  const [busy, setBusy] = useState(false);
  const warn: string[] = [];
  if (f.T_C !== null && (f.T_C < tempRange[0] || f.T_C > tempRange[1])) warn.push(`Temperature outside the instrument range ${tempRange[0]}…${tempRange[1]} °C`);
  if (f.RH_pct !== null && f.RH_pct > 85) warn.push("RH above 85 %: condensation risk");
  if (f.p_hPa !== null && (f.p_hPa < 860 || f.p_hPa > 1060)) warn.push("Unusual barometric pressure");

  const save = async () => {
    setBusy(true);
    try {
      await api(`/cases/${caseId}/sessions`, { body: { ...f, testId: f.testId || undefined, p_hPa: f.p_hPa ?? undefined, notes: f.notes || undefined } });
      toast.success("Environment recorded");
      setF({ ...f, T_C: null, RH_pct: null, p_hPa: null, notes: "" });
      onChange();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const toggle = (k: "equipmentUsed" | "weightsUsed", id: string) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader title="Environment log" subtitle="Temperature, humidity and pressure per test session" icon={<Thermometer className="h-4 w-4" />} />
        {sessions.length ? (
          <TableWrap>
            <table className="w-full">
              <thead className="surface-2 border-b border-line"><tr><th className={th}>Date</th><th className={th}>Test</th><th className={cn(th, "text-right")}>T (°C)</th><th className={cn(th, "text-right")}>RH (%)</th><th className={cn(th, "text-right")}>p (hPa)</th><th className={th}>Equipment / weights</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s._id} className="border-b border-line last:border-0">
                    <td className={td}>{date(s.date, true)}</td>
                    <td className={td}>{s.testId ?? <span className="text-muted">all</span>}</td>
                    <td className={cn(td, "tabular text-right")}>{s.T_C}</td>
                    <td className={cn(td, "tabular text-right")}>{s.RH_pct}</td>
                    <td className={cn(td, "tabular text-right")}>{s.p_hPa ?? "—"}</td>
                    <td className={cn(td, "text-muted text-xs")}>{[...(s.equipmentUsed ?? []).map((e: any) => e.name), ...(s.weightsUsed ?? []).map((w: any) => w.code)].join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <CardBody><EmptyState icon={<Thermometer className="h-5 w-5" />} title="No environment records yet" text="At least one record is required before submission." /></CardBody>}
      </Card>
      {editable && (
        <Card>
          <CardHeader title="Add record" subtitle="Expired equipment is blocked" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="T" unit="°C"><NumberInput className="h-10" value={f.T_C} onChange={(x) => setF({ ...f, T_C: x })} /></Field>
              <Field label="RH" unit="%"><NumberInput className="h-10" value={f.RH_pct} onChange={(x) => setF({ ...f, RH_pct: x })} /></Field>
              <Field label="p" unit="hPa"><NumberInput className="h-10" value={f.p_hPa} onChange={(x) => setF({ ...f, p_hPa: x })} /></Field>
            </div>
            <Field label="For test (optional)">
              <Select value={f.testId} onChange={(e) => setF({ ...f, testId: e.target.value })}>
                <option value="">All tests / session</option>
                {["T01", "T02", "T03", "T06", "T07b", "T11", "T12", "T13", "T14", "T15", "T16", "T19"].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            {warn.length > 0 && <div className="rounded-xl bg-cond-50 p-2.5 text-xs text-cond-700 dark:bg-cond-700/15 dark:text-cond-100">{warn.map((w) => <p key={w} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</p>)}</div>}
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Equipment used</p>
              <div className="flex flex-wrap gap-1.5">
                {(eq.data ?? []).map((e) => (
                  <button key={e.id} disabled={e.expired} onClick={() => toggle("equipmentUsed", e.id)} title={e.expired ? `Calibration expired ${e.cal_due}` : `Cal. due ${e.cal_due}`}
                    className={cn("rounded-lg px-2 py-1 text-xs ring-1 ring-inset", e.expired ? "cursor-not-allowed text-fail-600 line-through ring-fail-200" : f.equipmentUsed.includes(e.id) ? "bg-navy-600 text-white ring-navy-600" : "ring-line hover:bg-navy-50 dark:hover:bg-white/5")}>
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Standard weights used</p>
              <div className="scrollbar-thin flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                {(wt.data ?? []).filter((w) => w.nominal_g >= 1).map((w) => (
                  <button key={w.id} disabled={w.expired} onClick={() => toggle("weightsUsed", w.id)} title={w.expired ? `Calibration expired ${w.cal_due}` : `${w.class} · cert ${w.certificate}`}
                    className={cn("rounded-lg px-2 py-1 text-xs ring-1 ring-inset", w.expired ? "cursor-not-allowed text-fail-600 line-through ring-fail-200" : f.weightsUsed.includes(w.id) ? "bg-navy-600 text-white ring-navy-600" : "ring-line hover:bg-navy-50 dark:hover:bg-white/5")}>
                    {w.code}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Notes"><Textarea className="min-h-16" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <Button className="w-full" loading={busy} disabled={f.T_C === null || f.RH_pct === null} onClick={save}>Record environment</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ---------------- Attachments ---------------- */

export const ATTACHMENT_CATEGORIES = [
  { id: "INSTRUMENT_PHOTO", label: "Instrument photograph", required: true },
  { id: "NAMEPLATE", label: "Nameplate / descriptive markings", required: true },
  { id: "SEALING", label: "Sealing / securing provisions", required: false },
  { id: "TEST_SETUP", label: "Test set-up photograph", required: false },
  { id: "MANUAL", label: "Operating manual / documentation", required: false },
  { id: "CERTIFICATE", label: "Component certificates", required: false },
  { id: "OTHER", label: "Other", required: false },
];

function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let off = false;
    api<Response>(src, { raw: true }).then((r) => r.blob()).then((b) => { if (!off) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => {});
    return () => { off = true; if (u) URL.revokeObjectURL(u); };
  }, [src]);
  return url ? <img src={url} alt={alt} className={className} /> : <div className={cn("animate-pulse bg-slate-200 dark:bg-white/5", className)} />;
}

export function AttachmentsPanel({ caseId, attachments, editable, onChange }: { caseId: string; attachments: any[]; editable: boolean; onChange: () => void }) {
  const [cat, setCat] = useState("INSTRUMENT_PHOTO");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const have = new Set(attachments.map((a) => a.category));
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", cat);
      if (caption) fd.append("caption", caption);
      const r = await api(`/cases/${caseId}/attachments`, { form: fd });
      toast.success("File uploaded");
      setCaption("");
      onChange();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Checklist" subtitle="Required before submission" icon={<Paperclip className="h-4 w-4" />} />
        <CardBody className="space-y-2">
          {ATTACHMENT_CATEGORIES.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              {have.has(c.id) ? <CheckCircle2 className="h-4 w-4 text-pass-600" /> : <span className={cn("h-4 w-4 rounded-full ring-2 ring-inset", c.required ? "ring-fail-400" : "ring-slate-300")} />}
              <span className={cn(!have.has(c.id) && !c.required && "text-muted")}>{c.label}</span>
              {c.required && !have.has(c.id) && <Badge tone="fail" className="ml-auto">required</Badge>}
            </div>
          ))}
          {editable && (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <Field label="Category"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{ATTACHMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
              <Field label="Caption (optional)"><input className="h-10 w-full rounded-xl border border-line surface px-3 text-sm" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
              <Button className="w-full" loading={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Upload file</Button>
              <p className="text-muted text-[11px]">PNG, JPG, WEBP or PDF up to 15 MB. A digital fingerprint of each file is kept, so any later change to the file can be detected.</p>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Files" subtitle={`${attachments.length} attached`} />
        <CardBody>
          {attachments.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {attachments.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-line">
                  {a.mime?.startsWith("image/") ? <AuthImage src={`/cases/${caseId}/attachments/${a.id}/file`} alt={a.filename} className="h-36 w-full object-cover" /> : <div className="surface-2 grid h-36 place-items-center"><FileText className="text-muted h-10 w-10" /></div>}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.caption || a.filename}</p>
                        <p className="text-muted text-xs">{ATTACHMENT_CATEGORIES.find((c) => c.id === a.category)?.label}</p>
                      </div>
                      {editable && <button className="text-muted hover:text-fail-600" onClick={async () => { try { await api(`/cases/${caseId}/attachments/${a.id}`, { method: "DELETE" }); onChange(); } catch (e) { toast.error(errMsg(e)); } }}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No files yet" text="Upload the instrument photograph and nameplate." />}
        </CardBody>
      </Card>
    </div>
  );
}

/* ---------------- Comments ---------------- */

export function CommentsPanel({ caseId, comments, onChange, canComment }: { caseId: string; comments: any[]; onChange: () => void; canComment: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api(`/cases/${caseId}/comments`, { body: { text } }); setText(""); onChange(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title="Comments & review trail" icon={<MessageSquare className="h-4 w-4" />} />
      <CardBody className="space-y-4">
        {comments.length === 0 && <p className="text-muted text-sm">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c._id} className={cn("flex gap-3", c.role === "APPROVER" ? "" : "flex-row-reverse text-right")}>
            <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold", c.role === "APPROVER" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200" : "bg-navy-100 text-navy-700 dark:bg-navy-900/60 dark:text-navy-200")}>
              {c.author?.name?.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
            </div>
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm", c.kind === "return" ? "bg-saffron-50 ring-1 ring-saffron-200 dark:bg-saffron-700/15 dark:ring-saffron-700/30" : c.kind === "approve" || c.kind === "review" ? "bg-pass-50 ring-1 ring-pass-100 dark:bg-pass-700/15" : "surface-2 ring-1 ring-[var(--border)]")}>
              <div className={cn("mb-0.5 flex flex-wrap items-center gap-2 text-xs", c.role !== "APPROVER" && "justify-end")}>
                <span className="font-semibold">{c.author?.name}</span>
                {c.testId && <Badge tone="navy">{c.testId}</Badge>}
                {c.kind === "return" && <Badge tone="saffron">returned</Badge>}
                {c.kind === "approve" && <Badge tone="pass">approved</Badge>}
                {c.resolved && c.kind === "return" && <Badge tone="slate">resolved</Badge>}
                <span className="text-muted">{ago(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-left">{c.text}</p>
            </div>
          </div>
        ))}
        {canComment && (
          <div className="flex gap-2 border-t border-line pt-4">
            <Textarea className="min-h-11 flex-1" placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)} />
            <Button onClick={send} loading={busy} disabled={!text.trim()} size="icon" className="h-11 w-11"><Send className="h-4 w-4" /></Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------------- History (hash chain) ---------------- */

export function HistoryPanel({ caseId, rulepackHash, rulepackVersion }: { caseId: string; rulepackHash: string; rulepackVersion: string }) {
  const readings = useApi<any[]>(`/cases/${caseId}/readings`);
  const chain = useApi<any>(`/cases/${caseId}/chain`);
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Data entry history" subtitle="Every save is recorded permanently. Records cannot be edited or deleted." icon={<Link2 className="h-4 w-4" />} />
        <TableWrap>
          <table className="w-full">
            <thead className="surface-2 border-b border-line"><tr><th className={th}>#</th><th className={th}>When</th><th className={th}>What</th><th className={th}>By</th><th className={th}>Source</th></tr></thead>
            <tbody>
              {(readings.data ?? []).map((r) => (
                <tr key={r._id} className="border-b border-line last:border-0">
                  <td className={cn(td, "tabular text-muted")}>{r.seq}</td>
                  <td className={td}>{date(r.capturedAt, true)}</td>
                  <td className={td}><Badge tone="navy">{r.testId}</Badge></td>
                  <td className={td}>{r.user?.name}</td>
                  <td className={td}><Badge tone={r.source === "DEVICE" ? "pass" : r.source === "MIXED" ? "cond" : "slate"}>{r.source === "DEVICE" ? "From scale" : r.source === "MIXED" ? "Scale + typed" : "Typed"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <div className="space-y-4">
        <Card className={cn("overflow-hidden", chain.data && (chain.data.ok ? "ring-1 ring-pass-500/40" : "ring-1 ring-fail-500/40"))}>
          <CardBody>
            <div className="flex items-center gap-3">
              {chain.data?.ok ? <ShieldCheck className="h-9 w-9 text-pass-600" /> : <ShieldAlert className="h-9 w-9 text-fail-600" />}
              <div>
                <p className="font-semibold">{chain.data ? (chain.data.ok ? "Records intact — nothing altered" : `Record #${chain.data.brokenAt} was altered`) : "Checking…"}</p>
                <p className="text-muted text-xs">{chain.data?.count ?? 0} records checked</p>
              </div>
            </div>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => { chain.reload(); readings.reload(); }}>Check again</Button>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4 text-navy-600" /> Standard version used</div>
            <p className="mt-1 text-sm">{rulepackVersion}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
