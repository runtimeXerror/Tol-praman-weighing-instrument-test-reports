"use client";

import { ArrowRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { StatusBadge, VerdictBadge, VerdictDot } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { useCaseDetails } from "@/lib/use-cases";
import { cn } from "@/lib/utils";

export default function TestEntryForms() {
  const { data } = useCaseDetails(["DRAFT", "RETURNED"]);
  return (
    <div>
      <PageHeader back={{ href: "/engineer", label: "My Cases" }} title="Test Entry Forms" subtitle="Every applicable R 76 test for your open cases. Forms are prepared automatically from the instrument details and the standard; pick a test to continue." />
      {!data ? <Skeleton className="h-72" /> : data.length === 0 ? (
        <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No open cases" text="Cases in data entry appear here." />
      ) : (
        <div className="space-y-5">
          {data.map((c) => {
            const res = new Map((c.results ?? []).map((r: any) => [r.testId, r]));
            const app = (c.applicable ?? []).filter((t: any) => t.applicable);
            const done = app.filter((t: any) => res.get(t.id) && (res.get(t.id) as any).verdict !== "NOT_TESTED").length;
            return (
              <Card key={c.id} className="animate-slide-up">
                <CardHeader
                  title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-navy-600 dark:text-navy-300">{c.caseNo}</span>{c.title}</span>}
                  subtitle={`${c.manufacturer?.name ?? ""} · ${done}/${app.length} tests complete`}
                  actions={<><StatusBadge s={c.status} /><VerdictBadge v={c.verdict} /></>}
                />
                <div className="px-5 pt-3"><ProgressBar value={app.length ? (done / app.length) * 100 : 0} /></div>
                <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {(c.applicable ?? []).map((t: any) => {
                    const r: any = res.get(t.id);
                    return (
                      <Link key={t.id} href={t.applicable ? `/engineer/cases/${c.id}?tab=tests&test=${t.id}` : "#"}
                        className={cn("group flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition", t.applicable ? "hover:border-navy-300 hover:bg-navy-50/50 dark:hover:bg-white/5" : "pointer-events-none opacity-45")}>
                        <VerdictDot v={t.applicable ? r?.verdict : "NOT_APPLICABLE"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium"><span className="text-muted mr-1.5 font-mono text-xs">{t.id}</span>{t.name}</span>
                          <span className="text-muted block truncate text-[11px]">{t.applicable ? t.clause : t.reasons[0]}</span>
                        </span>
                        {t.applicable && <ArrowRight className="text-muted h-4 w-4 opacity-0 transition group-hover:opacity-100" />}
                      </Link>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
