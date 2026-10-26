"use client";

import { ClipboardCheck, FilePen, FolderOpen, Layers, ListTodo, MessageSquareWarning, Send, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CaseCard, caseProgress } from "@/components/case/case-card";
import { ReturnedList } from "@/components/case/returned-list";
import { SearchBox } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton, Stat } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Each filter shows exactly one group of cases; the stat cards and tabs use the same filters. */
const FILTERS = {
  active: { label: "Active", statuses: ["DRAFT", "RETURNED"], empty: "No open cases. New cases appear here when the senior engineer assigns them to you." },
  draft: { label: "In data entry", statuses: ["DRAFT"], empty: "No cases in data entry right now." },
  returned: { label: "Returned", statuses: ["RETURNED"], empty: "No returned cases — nothing has been sent back to you for correction." },
  submitted: { label: "Submitted", statuses: ["SUBMITTED", "REVIEWED", "APPROVED"], empty: "No cases waiting for review." },
  signed: { label: "Signed", statuses: ["SIGNED"], empty: "No signed reports yet." },
  all: { label: "All", statuses: null, empty: "No cases assigned to you yet." },
} as const;
type F = keyof typeof FILTERS;

/** Icon + colour per filter (same colours as the cards above). */
const CHIP: Record<F, { icon: LucideIcon; active: string; count: string}> = {
  active: { icon: ListTodo, active: "bg-navy-600 text-white ring-navy-600 shadow-md shadow-navy-900/20", count: "bg-white/20 text-white" },
  draft: { icon: FilePen, active: "bg-navy-50 text-navy-700 ring-navy-300 dark:bg-navy-400/20 dark:text-navy-100 dark:ring-navy-400/60", count: "bg-navy-600 text-white" },
  returned: { icon: MessageSquareWarning, active: "bg-saffron-50 text-saffron-700 ring-saffron-300 dark:bg-saffron-400/15 dark:text-saffron-200 dark:ring-saffron-400/60", count: "bg-saffron-500 text-white" },
  submitted: { icon: Send, active: "bg-violet-50 text-violet-700 ring-violet-300 dark:bg-violet-500/20 dark:text-violet-100 dark:ring-violet-400/60", count: "bg-violet-600 text-white" },
  signed: { icon: ClipboardCheck, active: "bg-pass-50 text-pass-700 ring-pass-500/40 dark:bg-pass-500/15 dark:text-[#86efac] dark:ring-pass-500/60", count: "bg-pass-600 text-white" },
  all: { icon: Layers, active: "bg-slate-800 text-white ring-slate-800 dark:bg-white dark:text-slate-900 dark:ring-white", count: "bg-white/20 text-current dark:bg-slate-900/10" },
};

function FilterChips({ value, onChange, count }: { value: F; onChange: (f: F) => void; count: (f: F) => number }) {
  return (
    <div role="tablist" aria-label="Filter cases" className="scrollbar-thin -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
      {(Object.keys(FILTERS) as F[]).map((k) => {
        const on = value === k;
        const c = CHIP[k];
        const n = count(k);
        return (
          <button key={k} role="tab" aria-selected={on} onClick={() => onChange(k)}
            className={cn("flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 ring-inset transition",
              on ? c.active : "surface text-muted ring-[var(--border)] hover:text-[var(--text)] hover:ring-navy-300 dark:hover:ring-navy-400/60")}>
            <c.icon className="h-4 w-4" />
            {FILTERS[k].label}
            <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular",
              on ? c.count : n > 0 ? "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-100" : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500")}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Work left" in one sentence, e.g. "12 tests left across 2 cases · 1 ready to submit · 2 returned for corrections". */
function summary(cases: any[]): string {
  const open = cases.filter((c) => c.status === "DRAFT" || c.status === "RETURNED");
  const left = open.reduce((n, c) => n + caseProgress(c).left, 0);
  const withLeft = open.filter((c) => caseProgress(c).left > 0).length;
  const ready = cases.filter((c) => c.status === "DRAFT" && caseProgress(c).total > 0 && caseProgress(c).left === 0).length;
  const returned = cases.filter((c) => c.status === "RETURNED").length;
  const parts = [
    left ? `${left} test${left > 1 ? "s" : ""} left across ${withLeft} case${withLeft > 1 ? "s" : ""}` : open.length ? "No tests left to enter" : "Nothing to do right now",
    ready ? `${ready} ready to submit` : "",
    returned ? `${returned} returned for corrections` : "",
  ].filter(Boolean);
  return parts.join(" · ") + ".";
}

function MyCasesView() {
  const { user } = useAuth();
  const q = useApi<any[]>("/cases");
  const sp = useSearchParams();
  const router = useRouter();
  const p = sp.get("filter");
  const f: F = p && p in FILTERS ? (p as F) : "active";
  const setF = (k: F) => router.replace(k === "active" ? "/engineer" : `/engineer?filter=${k}`, { scroll: false });
  const [s, setS] = useState("");
  const inFilter = (c: any, k: F) => { const st = FILTERS[k].statuses as readonly string[] | null; return !st || st.includes(c.status); };
  const count = (k: F) => (q.data ?? []).filter((c) => inFilter(c, k)).length;
  const list = useMemo(() => {
    const t = s.toLowerCase();
    return (q.data ?? [])
      .filter((c) => inFilter(c, f))
      .filter((c) => !t || [c.caseNo, c.title, c.manufacturer?.name, c.instrument?.model, c.applicationNo].some((x) => x?.toLowerCase().includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, f, s]);
  const hour = new Date().getHours();

  return (
    <div>
      <PageHeader
        eyebrow={`${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${user?.name.split(" ")[0]}`}
        title="My Cases"
        subtitle={q.data ? summary(q.data) : "Cases assigned to you by the senior engineer."}
        actions={<SearchBox value={s} onChange={setS} placeholder="Search case, model, manufacturer…" />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In data entry" value={count("draft")} icon={<FilePen className="h-5 w-5" />} onClick={() => setF("draft")} active={f === "draft"} />
        <Stat label="Returned with comments" value={count("returned")} tone="saffron" icon={<MessageSquareWarning className="h-5 w-5" />} onClick={() => setF("returned")} active={f === "returned"} />
        <Stat label="Submitted / in review" value={count("submitted")} tone="violet" icon={<Send className="h-5 w-5" />} onClick={() => setF("submitted")} active={f === "submitted"} />
        <Stat label="Signed reports" value={count("signed")} tone="pass" icon={<ClipboardCheck className="h-5 w-5" />} onClick={() => setF("signed")} active={f === "signed"} />
      </div>
      <FilterChips value={f} onChange={setF} count={count} />
      {f === "returned" ? (
        <>
          <p className="text-muted -mt-1 mb-4 text-sm">Cases the senior engineer sent back. Fix the points below, then resubmit from the case page.</p>
          <ReturnedList search={s} />
        </>
      ) : q.loading && !q.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>
      ) : list.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((c) => <CaseCard key={c.id} c={c} href={`/engineer/cases/${c.id}`} />)}</div>
      ) : (
        <EmptyState icon={<FolderOpen className="h-5 w-5" />} title={s ? "No cases match your search" : `Nothing in "${FILTERS[f].label}"`} text={s ? "Try a different search term." : FILTERS[f].empty} />
      )}
    </div>
  );
}

export default function MyCases() {
  return <Suspense><MyCasesView /></Suspense>;
}
