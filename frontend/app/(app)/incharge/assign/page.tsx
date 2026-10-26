"use client";

import { ArrowRight, FolderOpen, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { caseProgress } from "@/components/case/case-card";
import { SearchBox } from "@/components/shell/app-shell";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, EmptyState, Skeleton, td, th, TableWrap } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Cases still with a test engineer (draft or sent back): reassign when someone is on leave or overloaded. */
export default function Assignments() {
  const cases = useApi<any[]>("/cases?status=DRAFT,RETURNED");
  const dash = useApi<any>("/dashboard/incharge");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<any>(null);
  const [f, setF] = useState({ engineer: "", reason: "", dueDate: "" });
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return (cases.data ?? []).filter((c) => !t || [c.caseNo, c.title, c.assignedEngineer?.name, c.manufacturer?.name].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => (a.assignedEngineer ? 1 : 0) - (b.assignedEngineer ? 1 : 0) || +new Date(a.dueDate ?? 8.64e15) - +new Date(b.dueDate ?? 8.64e15));
  }, [cases.data, q]);
  const hasData = (c: any) => caseProgress(c).done > 0 || c.status === "RETURNED";
  const now = Date.now();

  const save = async () => {
    setBusy(true);
    try {
      await api(`/cases/${pick.id}/assign`, { method: "PUT", body: { engineer: f.engineer, reason: f.reason.trim() || undefined, dueDate: f.dueDate || undefined } });
      toast.success(pick.assignedEngineer ? `${pick.caseNo} reassigned` : `${pick.caseNo} assigned`);
      setPick(null);
      cases.reload();
      dash.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader back={{ href: "/incharge", label: "Dashboard" }} title="Assignments" subtitle="Cases still with a test engineer, or received and not yet assigned. Assign or reassign here; every change is logged."
        actions={<SearchBox value={q} onChange={setQ} placeholder="Search case, engineer, manufacturer…" />} />
      <Card>
        {!cases.data ? <div className="p-5"><Skeleton className="h-48" /></div> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<FolderOpen className="h-5 w-5" />} title={q ? "No cases match your search" : "No cases with engineers"} text="Cases appear here from the moment they are assigned until they are submitted." /></div>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead className="surface-2 border-b border-line">
                <tr><th className={th}>Case</th><th className={th}>Engineer</th><th className={th}>Stage</th><th className={cn(th, "text-center")}>Tests left</th><th className={th}>Due</th><th className={th} /></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const p = caseProgress(c);
                  const late = c.dueDate && +new Date(c.dueDate) < now;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className={td}>
                        <Link href={`/incharge/history?q=${encodeURIComponent(c.caseNo)}`} className="font-mono text-xs font-semibold text-navy-600 hover:underline dark:text-navy-300">{c.caseNo}</Link>
                        <p className="max-w-72 truncate text-sm">{c.title}</p>
                      </td>
                      <td className={td}>{c.assignedEngineer?.name ?? <Badge tone="saffron">Unassigned</Badge>}</td>
                      <td className={td}><StatusBadge s={c.status} /></td>
                      <td className={cn(td, "tabular text-center")}>{p.total ? <><b>{p.left}</b><span className="text-muted"> / {p.total}</span></> : <span className="text-muted">not started</span>}</td>
                      <td className={cn(td, "text-xs", late ? "font-semibold text-fail-600" : "text-muted")}>{c.dueDate ? date(c.dueDate) : "—"}{late && " · overdue"}</td>
                      <td className={cn(td, "text-right")}>
                        <Button size="sm" variant="secondary" onClick={() => { setPick(c); setF({ engineer: "", reason: "", dueDate: "" }); }}><Users className="h-3.5 w-3.5" /> {c.assignedEngineer ? "Reassign" : "Assign"}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Dialog open={!!pick} onClose={() => setPick(null)} title={pick?.assignedEngineer ? `Reassign ${pick?.caseNo ?? ""}` : `Assign ${pick?.caseNo ?? ""}`}
        subtitle={pick ? (pick.assignedEngineer ? `Now with ${pick.assignedEngineer.name}. Readings already entered stay with the case and remain in its history.` : "Not yet assigned to a test engineer.") : undefined}
        footer={<><Button variant="secondary" onClick={() => setPick(null)}>Cancel</Button><Button loading={busy} disabled={!f.engineer || (pick && hasData(pick) && f.reason.trim().length < 3)} onClick={save}><UserCheck className="h-4 w-4" /> {pick?.assignedEngineer ? "Reassign" : "Assign"} <ArrowRight className="h-4 w-4" /></Button></>}>
        <div className="space-y-4">
          <Field label={pick?.assignedEngineer ? "New test engineer" : "Test engineer"}>
            <Select value={f.engineer} onChange={(e) => setF({ ...f, engineer: e.target.value })}>
              <option value="">Choose…</option>
              {(dash.data?.workload ?? []).filter((e: any) => e.id !== pick?.assignedEngineer?._id).map((e: any) => (
                <option key={e.id} value={e.id}>{e.name} · {e.activeCases} open case{e.activeCases === 1 ? "" : "s"}, {e.testsLeft} tests left</option>
              ))}
            </Select>
          </Field>
          <Field label={pick && hasData(pick) ? "Reason (required: readings already entered)" : "Reason (optional)"}>
            <Textarea className="min-h-16" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Ravi on leave until 5 Oct" />
          </Field>
          <Field label="New due date (optional)"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
