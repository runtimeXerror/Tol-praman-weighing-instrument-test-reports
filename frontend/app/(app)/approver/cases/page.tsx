"use client";

import { ArrowRight, ClipboardList, FileSignature, FlaskConical, FolderOpen, Layers, PenLine, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { SignDialog } from "@/components/case/sign-dialog";
import { SearchBox } from "@/components/shell/app-shell";
import { StatusBadge, VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton, td, th, TableWrap } from "@/components/ui/misc";
import { VIEWS, viewById, type ViewId } from "@/lib/case-views";
import { ago, date, mass } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ICON: Record<ViewId, LucideIcon> = {
  active: FlaskConical, review: ClipboardList, sign: PenLine, conditional: TriangleAlert, failing: XCircle,
  "signed-month": FileSignature, signed: FileSignature, all: Layers,
};
const TONE: Record<ViewId, string> = {
  active: "bg-navy-600 text-white ring-navy-600", review: "bg-violet-600 text-white ring-violet-600", sign: "bg-saffron-500 text-white ring-saffron-500",
  conditional: "bg-cond-500 text-white ring-cond-500", failing: "bg-fail-600 text-white ring-fail-600", "signed-month": "bg-pass-600 text-white ring-pass-600",
  signed: "bg-pass-600 text-white ring-pass-600", all: "bg-slate-800 text-white ring-slate-800 dark:bg-white dark:text-slate-900 dark:ring-white",
};

function CasesView() {
  const sp = useSearchParams();
  const router = useRouter();
  const view = viewById(sp.get("view"));
  const cases = useApi<any[]>("/cases");
  const [q, setQ] = useState("");
  const [signing, setSigning] = useState<any>(null);

  const count = (id: ViewId) => (cases.data ?? []).filter(viewById(id).match).length;
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return (cases.data ?? []).filter(view.match).filter((c) => !t || [c.caseNo, c.title, c.manufacturer?.name, c.instrument?.model, c.assignedEngineer?.name, c.applicationNo].some((x) => x?.toLowerCase().includes(t)));
  }, [cases.data, view, q]);
  const Icon = ICON[view.id];

  return (
    <div>
      <PageHeader
        back={{ href: "/approver", label: "Lab Dashboard" }}
        title={<span className="flex items-center gap-3"><span className={cn("grid h-10 w-10 place-items-center rounded-xl ring-1", TONE[view.id])}><Icon className="h-5 w-5" /></span>{view.title}<span className="text-muted text-xl font-semibold tabular">{cases.data ? rows.length : ""}</span></span>}
        subtitle={view.description}
        actions={<SearchBox value={q} onChange={setQ} placeholder="Search case, model, manufacturer, engineer…" />}
      />

      {/* switch view without going back */}
      <div role="tablist" className="scrollbar-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {VIEWS.map((v) => {
          const on = v.id === view.id;
          const VI = ICON[v.id];
          return (
            <Link key={v.id} role="tab" aria-selected={on} href={`/approver/cases?view=${v.id}`} replace
              className={cn("flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 ring-inset transition",
                on ? TONE[v.id] + " shadow-md" : "surface text-muted ring-[var(--border)] hover:text-[var(--text)] hover:ring-navy-300")}>
              <VI className="h-4 w-4" /> {v.title}
              <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular", on ? "bg-white/25" : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-100")}>{cases.data ? count(v.id) : "·"}</span>
            </Link>
          );
        })}
      </div>

      <Card>
        {!cases.data ? <CardBody><Skeleton className="h-48" /></CardBody> : rows.length === 0 ? (
          <CardBody><EmptyState icon={<FolderOpen className="h-5 w-5" />} title={q ? "No cases match your search" : `Nothing in "${view.title}"`} text={q ? "Try a different search term." : view.empty} /></CardBody>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead className="surface-2 border-b border-line">
                <tr><th className={th}>Case</th><th className={th}>Instrument</th><th className={th}>Manufacturer</th><th className={th}>Engineer</th><th className={th}>Status</th><th className={th}>Verdict</th><th className={th}>{view.id === "review" ? "Submitted" : view.id.startsWith("signed") ? "Signed" : "Due"}</th><th className={th} /></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/approver/cases/${c.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-navy-50/40 dark:hover:bg-white/[0.03]">
                    <td className={td}><span className="font-mono text-xs font-semibold text-navy-600 dark:text-navy-300">{c.caseNo}</span>{c.priority === "urgent" && <span className="ml-1.5 rounded bg-saffron-400 px-1 text-[10px] font-bold text-navy-950">URGENT</span>}</td>
                    <td className={td}><p className="font-medium">{c.instrument?.model}</p><p className="text-muted text-xs">Class {c.instrument?.cls === "IIII" && c.profile === "IN" ? "IV" : c.instrument?.cls} · {mass(c.instrument?.max_g)}</p></td>
                    <td className={cn(td, "max-w-56 truncate")}>{c.manufacturer?.name}</td>
                    <td className={td}>{c.assignedEngineer?.name}</td>
                    <td className={td}><StatusBadge s={c.status} /></td>
                    <td className={td}><VerdictBadge v={c.verdict} /></td>
                    <td className={cn(td, "text-muted text-xs")}>{view.id === "review" ? ago(c.submittedAt) : c.signedAt ? date(c.signedAt) : c.dueDate ? date(c.dueDate) : "—"}</td>
                    <td className={cn(td, "text-right")} onClick={(e) => e.stopPropagation()}>
                      {view.action === "sign" ? (
                        <Button size="sm" onClick={() => setSigning(c)}><PenLine className="h-3.5 w-3.5" /> Sign</Button>
                      ) : (
                        <Button size="sm" variant={view.action === "review" ? "primary" : "secondary"} href={`/approver/cases/${c.id}`}>{view.action === "review" ? "Review" : "Open"} <ArrowRight className="h-3.5 w-3.5" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <SignDialog c={signing} open={!!signing} onClose={() => setSigning(null)} onDone={cases.reload} />
    </div>
  );
}

export default function ApproverCasesPage() {
  return <Suspense><CasesView /></Suspense>;
}
