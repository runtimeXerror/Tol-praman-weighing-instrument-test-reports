"use client";

import { AlarmClock, BarChart3, ClipboardList, FileSignature, FlaskConical, Layers, PenLine, PlusCircle, TriangleAlert, Users, XCircle } from "lucide-react";
import { FailureBars, TrendChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Skeleton, Stat, td, th, TableWrap } from "@/components/ui/misc";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function LabDashboard() {
  const dash = useApi<any>("/dashboard/lab");
  const k = dash.data?.kpis;

  return (
    <div>
      <PageHeader eyebrow="Senior Engineer" title="Lab Dashboard"
        subtitle="Testing activity, review workload and report status across the laboratory."
        actions={<Button variant="secondary" href="/approver/cases?view=all"><Layers className="h-4 w-4" /> All cases</Button>} />

      {!k ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <Stat label="In process" value={k.inProcess} hint="draft or returned" icon={<FlaskConical className="h-5 w-5" />} href="/approver/cases?view=active" />
          <Stat label="Awaiting review" value={k.awaitingReview} tone="violet" hint="submitted by engineers" icon={<ClipboardList className="h-5 w-5" />} href="/approver/cases?view=review" />
          <Stat label="Awaiting signature" value={k.awaitingSignature} tone="saffron" hint="approved" icon={<PenLine className="h-5 w-5" />} href="/approver/cases?view=sign" />
          <Stat label="Conditional flags" value={k.conditionalFlags} tone="cond" hint="U crosses the limit" icon={<TriangleAlert className="h-5 w-5" />} href="/approver/cases?view=conditional" />
          <Stat label="Failing (unsigned)" value={k.failing} tone="fail" hint="at least one test fails" icon={<XCircle className="h-5 w-5" />} href="/approver/cases?view=failing" />
          <Stat label="Signed this month" value={k.signedThisMonth} tone="pass" hint={k.avgTurnaroundDays !== null ? `avg turnaround ${k.avgTurnaroundDays} d` : undefined} icon={<FileSignature className="h-5 w-5" />} href="/approver/cases?view=signed-month" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Cases opened vs reports signed" subtitle="Last six months" icon={<BarChart3 className="h-4 w-4" />} />
          <CardBody>{dash.data ? <TrendChart data={dash.data.monthly} /> : <Skeleton className="h-56" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Where instruments fail" subtitle="Tests with FAIL / CONDITIONAL results" icon={<TriangleAlert className="h-4 w-4" />} />
          <CardBody>{dash.data?.failureFrequency?.length ? <FailureBars rows={dash.data.failureFrequency} /> : <p className="text-muted text-sm">No failures recorded.</p>}</CardBody>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Engineer workload" icon={<Users className="h-4 w-4" />} />
          <TableWrap>
            <table className="w-full">
              <thead className="surface-2 border-b border-line"><tr><th className={th}>Engineer</th><th className={cn(th, "text-right")}>Active</th><th className={cn(th, "text-right")}>In review</th><th className={cn(th, "text-right")}>Signed</th></tr></thead>
              <tbody>
                {(dash.data?.workload ?? []).map((w: any) => (
                  <tr key={w.id} className="border-b border-line last:border-0">
                    <td className={td}>{w.name}</td>
                    <td className={cn(td, "tabular text-right font-semibold")}>{w.active}</td>
                    <td className={cn(td, "tabular text-right")}>{w.submitted}</td>
                    <td className={cn(td, "tabular text-right")}>{w.signed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Turnaround per signed case" subtitle="Case opened → report signed" icon={<AlarmClock className="h-4 w-4" />} />
          <CardBody>
            {dash.data?.turnaround?.length ? (
              <div className="space-y-2.5">
                {dash.data.turnaround.map((t: any) => {
                  const max = Math.max(...dash.data.turnaround.map((x: any) => x.days), 1);
                  return (
                    <div key={t.caseNo} className="flex items-center gap-3 text-[12.5px]">
                      <span className="w-28 shrink-0 font-mono text-[11px] text-navy-600 dark:text-navy-300">{t.caseNo}</span>
                      <span className="text-muted hidden w-24 shrink-0 truncate sm:block">{t.model}</span>
                      <div className="h-2.5 flex-1 rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-[#3f76cf]" style={{ width: `${(t.days / max) * 100}%` }} /></div>
                      <span className="tabular w-14 shrink-0 text-right font-semibold">{t.days} d</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-muted text-sm">No signed cases yet.</p>}
          </CardBody>
        </Card>
      </div>

    </div>
  );
}
