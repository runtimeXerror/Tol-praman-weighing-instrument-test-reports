"use client";

import { CalendarClock, ChevronRight, Factory } from "lucide-react";
import Link from "next/link";
import { date, mass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge, VerdictBadge } from "../ui/badge";
import { ProgressBar } from "../ui/misc";

export function caseProgress(c: any) {
  const k = c.counts ?? {};
  const total = (k.PASS ?? 0) + (k.CONDITIONAL ?? 0) + (k.FAIL ?? 0) + (k.NOT_TESTED ?? 0);
  const done = (k.PASS ?? 0) + (k.CONDITIONAL ?? 0) + (k.FAIL ?? 0);
  return { done, total, left: total - done, pct: total ? (done / total) * 100 : 0 };
}

/** One plain line telling the engineer what is left on this case. */
export function workLeft(c: any): { text: string; tone: "todo" | "ready" | "fix" | "wait" | "done" } {
  const p = caseProgress(c);
  if (c.status === "SIGNED") return { text: "Completed", tone: "done" };
  if (["SUBMITTED", "REVIEWED", "APPROVED"].includes(c.status)) return { text: "With the senior engineer", tone: "wait" };
  if (c.status === "RETURNED") {
    const back = Object.values(c.testReviews ?? {}).filter((r: any) => r?.state === "RETURNED").length;
    if (back) return { text: `Re-test ${back} test${back > 1 ? "s" : ""}, then resubmit`, tone: "fix" };
    return { text: p.left ? `Corrections + ${p.left} test${p.left > 1 ? "s" : ""} left` : "Make the corrections, then resubmit", tone: "fix" };
  }
  if (!p.total) return { text: "Enter the instrument profile to start", tone: "todo" };
  if (p.left) return { text: `${p.left} of ${p.total} tests left`, tone: "todo" };
  return { text: "All tests done: ready to submit", tone: "ready" };
}

export function CaseCard({ c, href }: { c: any; href: string }) {
  const p = caseProgress(c);
  const w = workLeft(c);
  const overdue = c.dueDate && new Date(c.dueDate) < new Date() && c.status !== "SIGNED";
  return (
    <Link href={href} className="card group flex flex-col p-4 transition hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lift animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-navy-600 dark:text-navy-300">{c.caseNo}</span>
            {c.priority === "urgent" && <span className="rounded bg-saffron-400 px-1.5 text-[10px] font-bold text-navy-950">URGENT</span>}
            {c.revision > 0 && <span className="rounded bg-violet-600 px-1.5 text-[10px] font-bold text-white">REV {c.revision}</span>}
          </div>
          <p className="mt-1 line-clamp-2 font-semibold leading-snug">{c.title}</p>
        </div>
        <StatusBadge s={c.status} />
      </div>
      <div className="text-muted mt-3 space-y-1 text-xs">
        <p className="flex items-center gap-1.5"><Factory className="h-3.5 w-3.5" /> <span className="truncate">{c.manufacturer?.name ?? "—"}</span></p>
        <p className="flex items-center gap-1.5">
          <span className="rounded bg-navy-50 px-1.5 font-semibold text-navy-700 dark:bg-navy-900/60 dark:text-navy-200">Class {c.instrument?.cls === "IIII" && c.profile === "IN" ? "IV" : c.instrument?.cls ?? "?"}</span>
          Max {mass(c.instrument?.max_g)} · e {mass(c.instrument?.e_g)}
        </p>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className={cn("font-semibold", w.tone === "todo" ? "text-navy-700 dark:text-navy-200" : w.tone === "ready" ? "text-pass-700 dark:text-[#86efac]" : w.tone === "fix" ? "text-saffron-700 dark:text-saffron-300" : "text-muted font-medium")}>{w.text}</span>
          <span className="text-muted tabular shrink-0 text-[11px]">{p.done}/{p.total} done</span>
        </div>
        <ProgressBar value={p.pct} tone={p.done === p.total && p.total ? "pass" : "navy"} />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <VerdictBadge v={c.verdict} />
        <span className={cn("flex items-center gap-1 text-xs", overdue ? "font-semibold text-fail-600" : "text-muted")}>
          <CalendarClock className="h-3.5 w-3.5" /> {c.status === "SIGNED" ? `Signed ${date(c.signedAt)}` : c.dueDate ? `Due ${date(c.dueDate)}` : `Updated ${date(c.updatedAt)}`}
          <ChevronRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
        </span>
      </div>
    </Link>
  );
}
