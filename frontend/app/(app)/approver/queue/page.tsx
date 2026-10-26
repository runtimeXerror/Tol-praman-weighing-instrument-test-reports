"use client";

import { ArrowRight, ClipboardList, Timer } from "lucide-react";
import { StatusBadge, VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ago, mass } from "@/lib/format";
import { useApi } from "@/lib/hooks";

export default function ReviewQueue() {
  const q = useApi<any[]>("/cases?status=SUBMITTED,REVIEWED");
  return (
    <div>
      <PageHeader back={{ href: "/approver", label: "Lab Dashboard" }} title="Review Queue" subtitle="Cases submitted by engineers. Review every test, comment, and return or approve. You cannot approve a case you entered data for." />
      {!q.data ? <Skeleton className="h-64" /> : q.data.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Queue is empty" text="Submitted cases will appear here." />
      ) : (
        <div className="space-y-3">
          {q.data.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center gap-4 p-4 animate-slide-up">
              <div className={`h-12 w-1.5 rounded-full ${c.verdict === "FAIL" ? "bg-fail-500" : c.verdict === "CONDITIONAL" ? "bg-cond-500" : "bg-pass-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-navy-600 dark:text-navy-300">{c.caseNo}</span>
                  <StatusBadge s={c.status} />
                  <VerdictBadge v={c.verdict} />
                  {(c.plausibilityFlags ?? []).length > 0 && <span className="inline-flex items-center gap-1 text-xs text-cond-600"><Timer className="h-3.5 w-3.5" /> time flag</span>}
                </div>
                <p className="mt-1 font-semibold">{c.title}</p>
                <p className="text-muted text-xs">{c.manufacturer?.name} · Max {mass(c.instrument?.max_g)} · by {c.assignedEngineer?.name} · submitted {ago(c.submittedAt)}</p>
              </div>
              <div className="flex gap-4 text-center text-xs">
                {(["PASS", "CONDITIONAL", "FAIL"] as const).map((k) => <div key={k}><p className="tabular text-lg font-bold">{c.counts?.[k] ?? 0}</p><p className="text-muted">{k === "CONDITIONAL" ? "Cond." : k[0] + k.slice(1).toLowerCase()}</p></div>)}
              </div>
              <Button href={`/approver/cases/${c.id}`}>Review <ArrowRight className="h-4 w-4" /></Button>
            </Card>
          ))}
        </div>
      )}
      <p className="text-muted mt-6 text-xs">Tip: rows marked <span className="font-semibold text-cond-600">Conditional</span> are within mpe, but the expanded uncertainty crosses the limit (guarded decision rule).</p>
    </div>
  );
}
