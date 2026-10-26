"use client";

import { ArrowRightLeft, History as HistoryIcon, PackageCheck, UserCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { SearchBox } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton, Tabs } from "@/components/ui/misc";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Where the instrument is now, in plain words (no results: the Lab In-charge only tracks assignments). */
const STAGE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Testing", tone: "navy" },
  RETURNED: { label: "Re-test", tone: "saffron" },
  SUBMITTED: { label: "With senior engineer", tone: "violet" },
  REVIEWED: { label: "With senior engineer", tone: "violet" },
  APPROVED: { label: "Awaiting signature", tone: "violet" },
  SIGNED: { label: "Report issued", tone: "pass" },
};
const FILTERS = {
  all: { label: "All", match: () => true },
  unassigned: { label: "Unassigned", match: (h: any) => !h.engineer },
  testing: { label: "Testing", match: (h: any) => ["DRAFT", "RETURNED"].includes(h.status) },
  senior: { label: "With senior engineer", match: (h: any) => ["SUBMITTED", "REVIEWED", "APPROVED"].includes(h.status) },
  done: { label: "Report issued", match: (h: any) => h.status === "SIGNED" },
  moved: { label: "Reassigned", match: (h: any) => h.reassignments.length > 0 },
} as const;
type Filter = keyof typeof FILTERS;

function Step({ icon, title, sub, last }: { icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && <span className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-[var(--border)]" />}
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 dark:bg-navy-400/15 dark:text-navy-200">{icon}</span>
      <div className="min-w-0 pt-0.5 text-sm"><p>{title}</p>{sub && <p className="text-muted text-xs">{sub}</p>}</div>
    </li>
  );
}

function HistoryView() {
  const sp = useSearchParams();
  const h = useApi<any[]>("/cases/assignments/history");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [f, setF] = useState<Filter>("all");
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return (h.data ?? []).filter(FILTERS[f].match).filter((x) => !t || [x.caseNo, x.title, x.model, x.manufacturer, x.engineer, x.firstEngineer, x.receipt?.sampleNo].some((v) => v?.toLowerCase().includes(t)));
  }, [h.data, q, f]);

  return (
    <div>
      <PageHeader back={{ href: "/incharge", label: "Dashboard" }} title="History" subtitle="Every instrument received by the lab: when it came in, who it was assigned to, and any reassignment."
        actions={<SearchBox value={q} onChange={setQ} placeholder="Case, sample no., model, engineer…" />} />
      <Tabs<Filter> className="mb-4" value={f} onChange={setF}
        tabs={(Object.keys(FILTERS) as Filter[]).map((k) => ({ id: k, label: FILTERS[k].label, count: h.data ? h.data.filter(FILTERS[k].match).length : undefined }))} />
      {!h.data ? <Skeleton className="h-64" /> : rows.length === 0 ? (
        <EmptyState icon={<HistoryIcon className="h-5 w-5" />} title="Nothing found" text={q ? "Try a different search term." : "No instruments in this group."} />
      ) : (
        <div className="space-y-3">
          {rows.map((x) => {
            const st = STAGE[x.status] ?? { label: x.status, tone: "slate" };
            const cond = x.receipt?.condition && x.receipt.condition !== "good";
            return (
              <Card key={x.id} className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] md:p-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-navy-600 dark:text-navy-300">{x.caseNo}</span>{x.revision > 0 && <Badge tone="violet">Rev {x.revision}</Badge>}</p>
                  <p className="mt-0.5 font-semibold leading-snug">{x.model || x.title}</p>
                  <p className="text-muted text-xs">{[x.type, x.manufacturer].filter(Boolean).join(" · ")}</p>
                </div>
                <ol>
                  <Step icon={<PackageCheck className="h-3.5 w-3.5" />}
                    title={<>Received {date(x.receivedAt)}{x.receipt?.sampleNo ? <> · sample <b>{x.receipt.sampleNo}</b></> : null}</>}
                    sub={cond ? <span className="font-semibold text-cond-600">{x.receipt.condition}: {x.receipt.notes}</span> : x.receipt?.receivedFrom ? `From ${x.receipt.receivedFrom}` : undefined} />
                  {x.firstEngineer ? (
                    <Step icon={<UserCheck className="h-3.5 w-3.5" />} last={!x.reassignments.length}
                      title={<>Assigned to <b>{x.firstEngineer}</b></>} sub={`${date(x.assignedAt)}${x.assignedBy ? ` · by ${x.assignedBy}` : ""}${x.dueDate ? ` · due ${date(x.dueDate)}` : ""}`} />
                  ) : (
                    <Step icon={<UserCheck className="h-3.5 w-3.5" />} last title={<span className="font-semibold text-saffron-600">Not yet assigned</span>} sub={x.dueDate ? `due ${date(x.dueDate)}` : undefined} />
                  )}
                  {x.reassignments.map((m: any, i: number) => (
                    <Step key={i} last={i === x.reassignments.length - 1} icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                      title={<>Reassigned {m.from ? <>from {m.from} </> : null}to <b>{m.to}</b></>}
                      sub={`${date(m.at)} · by ${m.by}${m.reason ? ` · ${m.reason}` : ""}`} />
                  ))}
                </ol>
                <div className="flex flex-row items-center gap-2 md:flex-col md:items-end">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <p className={cn("text-muted text-xs")}>{x.status === "SIGNED" ? `Issued ${date(x.signedAt)} · tested by ${x.engineer}` : !x.engineer ? "Unassigned" : ["DRAFT", "RETURNED"].includes(x.status) ? `With ${x.engineer}` : `Tested by ${x.engineer}`}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InchargeHistory() {
  return <Suspense><HistoryView /></Suspense>;
}
