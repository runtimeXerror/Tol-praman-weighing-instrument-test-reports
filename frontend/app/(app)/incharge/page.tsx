"use client";

import { AlertTriangle, CalendarClock, FileSignature, FlaskConical, PackageCheck, PackagePlus, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton, Stat, td, th, TableWrap } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Lab In-charge home: what came in, who is testing what, and what is late. */
export default function InchargeDashboard() {
  const { user } = useAuth();
  const q = useApi<any>("/dashboard/incharge");
  const k = q.data?.kpis;
  const attention = (q.data?.openCases ?? []).filter((c: any) => c.overdue || c.unassigned || (c.receipt?.condition && c.receipt.condition !== "good"));

  return (
    <div>
      <PageHeader eyebrow={`Welcome, ${user?.name.split(" ")[0]}`} title="Lab Dashboard"
        subtitle="Instruments received, who is testing them, and what needs your attention."
        actions={<Button href="/incharge/new"><PackagePlus className="h-4 w-4" /> Receive & assign</Button>} />

      {!k ? <Skeleton className="h-28" /> : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="Received this month" value={k.receivedThisMonth} icon={<PackageCheck className="h-5 w-5" />} href="/incharge/history" />
          <Stat label="Unassigned" value={k.unassigned} tone={k.unassigned ? "saffron" : "pass"} icon={<UserX className="h-5 w-5" />} href="/incharge/assign" />
          <Stat label="With test engineers" value={k.withEngineers} icon={<FlaskConical className="h-5 w-5" />} href="/incharge/assign" />
          <Stat label="With senior engineer" value={k.withSenior} tone="violet" icon={<UserCheck className="h-5 w-5" />} href="/incharge/history" />
          <Stat label="Overdue" value={k.overdue} tone={k.overdue ? "fail" : "pass"} icon={<CalendarClock className="h-5 w-5" />} href="/incharge/assign" />
          <Stat label="Signed this month" value={k.signedThisMonth} tone="pass" icon={<FileSignature className="h-5 w-5" />} href="/incharge/history" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Test engineer workload" subtitle="Open cases and tests still to be done" icon={<UserCheck className="h-4 w-4" />}
            actions={<Button size="sm" variant="secondary" href="/incharge/assign">Reassign</Button>} />
          {!q.data ? <div className="p-5"><Skeleton className="h-40" /></div> : (
            <TableWrap>
              <table className="w-full">
                <thead className="surface-2 border-b border-line">
                  <tr><th className={th}>Engineer</th><th className={cn(th, "text-center")}>Open cases</th><th className={cn(th, "text-center")}>Tests left</th><th className={cn(th, "text-center")}>Re-test</th><th className={cn(th, "text-center")}>With senior</th><th className={th}>Next due</th></tr>
                </thead>
                <tbody>
                  {q.data.workload.map((e: any) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className={td}><p className="font-medium">{e.name}</p><p className="text-muted text-xs">{e.designation}</p></td>
                      <td className={cn(td, "tabular text-center font-semibold")}>{e.activeCases}</td>
                      <td className={cn(td, "text-center")}>
                        <span className="tabular font-semibold">{e.testsLeft}</span>
                        <div className="mx-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-navy-500" style={{ width: `${Math.min(100, e.testsLeft * 3)}%` }} /></div>
                      </td>
                      <td className={cn(td, "tabular text-center")}>{e.returned ? <Badge tone="saffron">{e.returned}</Badge> : <span className="text-muted">0</span>}</td>
                      <td className={cn(td, "tabular text-center")}>{e.withSenior}</td>
                      <td className={cn(td, "text-xs")}>{e.nextDue ? <><span className="font-mono">{e.nextDue.caseNo}</span><span className="text-muted block">{date(e.nextDue.dueDate)}</span></> : <span className="text-muted">—</span>}{e.overdue ? <Badge tone="fail" className="ml-1">{e.overdue} overdue</Badge> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Needs attention" subtitle="Overdue, or received damaged / incomplete" icon={<AlertTriangle className="h-4 w-4" />} />
          <div className="p-3">
            {!q.data ? <Skeleton className="h-40" /> : attention.length === 0 ? (
              <EmptyState icon={<PackageCheck className="h-5 w-5" />} title="All on track" text="Nothing is overdue and every instrument arrived in good condition." />
            ) : attention.map((c: any) => (
              <Link key={c.id} href={`/incharge/history?q=${encodeURIComponent(c.caseNo)}`} className="block rounded-xl p-3 transition hover:bg-navy-50/60 dark:hover:bg-white/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-navy-600 dark:text-navy-300">{c.caseNo}</span>
                  <StatusBadge s={c.status} />
                </div>
                <p className="mt-0.5 truncate text-sm font-medium">{c.title}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  {c.overdue && <span className="font-semibold text-fail-600">Overdue since {date(c.dueDate)}</span>}
                  {c.unassigned && <span className="font-semibold text-saffron-600">Not yet assigned</span>}
                  {c.receipt?.condition && c.receipt.condition !== "good" && <span className="font-semibold text-cond-600">Received {c.receipt.condition}</span>}
                  {c.assignedEngineer?.name && <span className="text-muted">{c.assignedEngineer.name}</span>}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
