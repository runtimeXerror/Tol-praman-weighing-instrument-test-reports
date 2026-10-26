"use client";

import { validateInstrument } from "@tolpraman/engine";
import { loadPack } from "@tolpraman/rulepacks";
import { AlertTriangle, ArrowRight, CheckCircle2, PackageCheck, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, NumberInput, Select, Textarea } from "@/components/ui/form";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Counter scale 30 kg · III", type: "Electronic counter scale", cls: "III", max_kg: 30, e_g: 5, min_g: 100 },
  { label: "Platform 150 kg · III", type: "Electronic platform scale", cls: "III", max_kg: 150, e_g: 50, min_g: 1000 },
  { label: "Precision balance 600 g · II", type: "Electronic precision balance", cls: "II", max_kg: 0.6, e_g: 0.01, min_g: 0.5 },
  { label: "Weighbridge 60 t · III", type: "Electronic road weighbridge", cls: "III", max_kg: 60000, e_g: 20000, min_g: 400000 },
];

const today = () => new Date().toISOString().slice(0, 10);

/** Lab In-charge: record the instrument received at the lab and assign a test engineer. */
export default function ReceiveAndAssign() {
  const router = useRouter();
  const dash = useApi<any>("/dashboard/incharge");
  const engineers = dash.data?.workload as any[] | undefined;
  const [rc, setRc] = useState({ receivedAt: today(), sampleNo: "", receivedFrom: "", condition: "good", notes: "" });
  const [f, setF] = useState({ title: "", applicationNo: "", profile: "OIML", assignedEngineer: "", mfrName: "", mfrAddress: "", type: "", model: "", cls: "III", max_kg: null as number | null, e_g: null as number | null, min_g: null as number | null, dueDate: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const pack = useMemo(() => loadPack(f.profile as "IN" | "OIML").pack, [f.profile]);
  const v = useMemo(() => {
    if (!f.max_kg || !f.e_g) return null;
    try { return validateInstrument({ cls: f.cls, max_g: f.max_kg * 1000, min_g: f.min_g ?? 0, e_g: f.e_g, d_g: f.e_g, indication: "digital", power: "mains", electronic: true }, pack); } catch { return null; }
  }, [f, pack]);
  const receiptProblem = rc.receivedAt > today() ? "Received date cannot be in the future"
    : f.dueDate && f.dueDate < rc.receivedAt ? "Due date cannot be before the received date"
    : rc.condition !== "good" && !rc.notes.trim() ? "Describe the damage or what is missing" : null;

  const create = async () => {
    setBusy(true);
    try {
      const r = await api("/cases", {
        body: {
          title: f.title || `${f.model} ${f.type}`.trim(), applicationNo: f.applicationNo || undefined, profile: f.profile, assignedEngineer: f.assignedEngineer || undefined,
          manufacturer: { name: f.mfrName, address: f.mfrAddress }, applicant: { name: f.mfrName, address: f.mfrAddress },
          instrument: { type: f.type || undefined, model: f.model || undefined, cls: f.cls, ...(f.max_kg ? { max_g: f.max_kg * 1000 } : {}), ...(f.e_g ? { e_g: f.e_g, d_g: f.e_g } : {}), ...(f.min_g ? { min_g: f.min_g } : {}) },
          dueDate: f.dueDate || undefined, priority: f.priority,
          receipt: { receivedAt: rc.receivedAt, sampleNo: rc.sampleNo || undefined, receivedFrom: rc.receivedFrom || f.mfrName || undefined, condition: rc.condition, notes: rc.notes || undefined },
        },
      });
      toast.success(f.assignedEngineer ? `Case ${r.caseNo} received and assigned` : `Case ${r.caseNo} received; assign an engineer when ready`);
      router.push(`/incharge/history?q=${encodeURIComponent(r.caseNo)}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader back={{ href: "/incharge", label: "Dashboard" }} title="Receive & Assign" subtitle="Record the instrument received at the lab and assign it to a test engineer. The case uses the current version of the chosen standard." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Sample receipt" icon={<PackageCheck className="h-4 w-4" />} subtitle="When and in what condition the instrument arrived" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Received on"><Input type="date" max={today()} value={rc.receivedAt} onChange={(e) => setRc({ ...rc, receivedAt: e.target.value })} /></Field>
              <Field label="Sample no."><Input value={rc.sampleNo} onChange={(e) => setRc({ ...rc, sampleNo: e.target.value })} placeholder="e.g. S/2026/0042" /></Field>
              <Field label="Received from"><Input value={rc.receivedFrom} onChange={(e) => setRc({ ...rc, receivedFrom: e.target.value })} placeholder={f.mfrName || "Manufacturer / applicant"} /></Field>
              <Field label="Condition">
                <Select value={rc.condition} onChange={(e) => setRc({ ...rc, condition: e.target.value })}><option value="good">Good</option><option value="damaged">Damaged</option><option value="incomplete">Incomplete (parts / manual missing)</option></Select>
              </Field>
              {rc.condition !== "good" && <Field label="What is damaged or missing?" className="sm:col-span-2 lg:col-span-4"><Textarea className="min-h-16" value={rc.notes} onChange={(e) => setRc({ ...rc, notes: e.target.value })} /></Field>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Application" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Case title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. ABC-30 counter scale, class III, 30 kg" /></Field>
              <Field label="Application no."><Input value={f.applicationNo} onChange={(e) => setF({ ...f, applicationNo: e.target.value })} placeholder="MA/2026/…" /></Field>
              <Field label="Evaluation standard">
                <div className="grid grid-cols-2 gap-2">
                  {[["OIML", "OIML R 76-1:2006", "International Recommendation (as in the problem statement)"], ["IN", "India: LM (General) Rules 2011", "Seventh Schedule, Heading A: based on OIML R 76, with the Indian gazette differences"]].map(([id, t, s]) => (
                    <button key={id} type="button" onClick={() => setF({ ...f, profile: id })} className={cn("rounded-xl border p-3 text-left transition", f.profile === id ? "border-navy-500 bg-navy-50 ring-2 ring-navy-500/20 dark:bg-navy-900/40" : "border-line hover:bg-navy-50/50")}>
                      <p className="text-sm font-semibold">{t}</p><p className="text-muted text-xs">{s}</p>
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Due date"><Input type="date" min={rc.receivedAt} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
                <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="normal">Normal</option><option value="urgent">Urgent</option></Select></Field>
              </div>
              <Field label="Manufacturer"><Input value={f.mfrName} onChange={(e) => setF({ ...f, mfrName: e.target.value })} /></Field>
              <Field label="Address"><Input value={f.mfrAddress} onChange={(e) => setF({ ...f, mfrAddress: e.target.value })} /></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Instrument (initial)" subtitle="The engineer completes the full profile" actions={<div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.label} onClick={() => setF({ ...f, type: p.type, cls: p.cls, max_kg: p.max_kg, e_g: p.e_g, min_g: p.min_g })} className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700 hover:bg-navy-100 dark:bg-navy-900/50 dark:text-navy-200">{p.label}</button>)}</div>} />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Type"><Input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
              <Field label="Model"><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
              <Field label="Class"><Select value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })}>{pack.accuracy_classes.map((c) => <option key={c.id} value={c.id}>Class {c.display}</option>)}</Select></Field>
              <Field label="Max" unit="kg"><NumberInput className="h-10" value={f.max_kg} onChange={(x) => setF({ ...f, max_kg: x })} /></Field>
              <Field label="e" unit="g"><NumberInput className="h-10" value={f.e_g} onChange={(x) => setF({ ...f, e_g: x })} /></Field>
              <Field label="Min" unit="g"><NumberInput className="h-10" value={f.min_g} onChange={(x) => setF({ ...f, min_g: x })} /></Field>
            </CardBody>
            {v && (
              <div className={cn("mx-5 mb-5 rounded-xl p-3 text-sm", v.valid ? "bg-pass-50 text-pass-700 dark:bg-pass-700/15 dark:text-pass-100" : "bg-cond-50 text-cond-700 dark:bg-cond-700/15 dark:text-cond-100")}>
                {v.valid ? <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Valid: class {v.classDisplay}, n = {v.n.toLocaleString("en-IN")}</span> : v.issues.filter((i) => i.severity === "error").map((i) => <p key={i.code + i.message}>{i.message} <span className="opacity-70">({i.clause})</span></p>)}
              </div>
            )}
          </Card>
        </div>
        <Card className="xl:sticky xl:top-6 xl:self-start">
          <CardHeader title="Assign test engineer" subtitle="Optional now — assign later from Assignments if you're not sure yet" icon={<UserCheck className="h-4 w-4" />} />
          <CardBody className="space-y-2">
            {f.assignedEngineer && (
              <button onClick={() => setF({ ...f, assignedEngineer: "" })} className="flex w-full items-center justify-between rounded-xl border border-dashed border-line p-3 text-left text-xs text-muted transition hover:bg-navy-50/50 dark:hover:bg-white/5">
                Leave unassigned for now <span className="font-medium text-navy-600 dark:text-navy-300">Clear</span>
              </button>
            )}
            {(engineers ?? []).map((e) => (
              <button key={e.id} onClick={() => setF({ ...f, assignedEngineer: e.id })} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", f.assignedEngineer === e.id ? "border-navy-500 bg-navy-50 ring-2 ring-navy-500/20 dark:bg-navy-900/40" : "border-line hover:bg-navy-50/50 dark:hover:bg-white/5")}>
                <div className="grid h-9 w-9 place-items-center rounded-full bg-navy-100 text-xs font-bold text-navy-700 dark:bg-navy-800 dark:text-navy-100">{e.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{e.name}</p><p className="text-muted text-xs">{e.designation}</p></div>
                <span className="text-right text-xs">
                  <Badge tone={e.activeCases > 2 ? "saffron" : "slate"}>{e.activeCases} case{e.activeCases === 1 ? "" : "s"}</Badge>
                  <span className="text-muted mt-0.5 block">{e.testsLeft} tests left{e.overdue ? ` · ${e.overdue} overdue` : ""}</span>
                </span>
              </button>
            ))}
            {receiptProblem && <p className="flex items-center gap-1.5 text-xs text-fail-600"><AlertTriangle className="h-3.5 w-3.5" /> {receiptProblem}</p>}
            <Button className="mt-3 w-full" size="lg" loading={busy} disabled={!f.mfrName || !(f.title || f.model) || !!receiptProblem} onClick={create}>
              {f.assignedEngineer ? "Receive & assign" : "Receive (assign later)"} <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-muted text-xs">{f.assignedEngineer ? "The case appears on the engineer's My Cases straight away." : "The case waits in Assignments as Unassigned until you pick an engineer."} The senior engineer reviews it after the engineer submits.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
