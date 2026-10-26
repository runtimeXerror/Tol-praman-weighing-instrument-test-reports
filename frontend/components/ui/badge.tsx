import { CheckCircle2, CircleDashed, MinusCircle, TriangleAlert, XCircle } from "lucide-react";
import { STATUS_META, VERDICT_META } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Light: tinted fill + dark text. Dark: stronger fill, bright text and a visible outline (readable on dark cards). */
const tones: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/25 dark:text-slate-100 dark:ring-slate-400/50",
  navy: "bg-navy-50 text-navy-700 ring-navy-100 dark:bg-navy-400/25 dark:text-navy-100 dark:ring-navy-300/50",
  saffron: "bg-saffron-50 text-saffron-700 ring-saffron-200 dark:bg-saffron-400/20 dark:text-saffron-200 dark:ring-saffron-400/60",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/25 dark:text-violet-100 dark:ring-violet-400/50",
  pass: "bg-pass-50 text-pass-700 ring-pass-100 dark:bg-pass-500/20 dark:text-[#86efac] dark:ring-pass-500/60",
  cond: "bg-cond-50 text-cond-700 ring-cond-100 dark:bg-cond-500/20 dark:text-[#fcd34d] dark:ring-cond-500/60",
  fail: "bg-fail-50 text-fail-700 ring-fail-100 dark:bg-fail-500/20 dark:text-[#fca5a5] dark:ring-fail-500/60",
};

export function Badge({ tone = "slate", className, children }: { tone?: keyof typeof tones | string; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap", tones[tone] ?? tones.slate, className)}>{children}</span>;
}

const VT: Record<string, { tone: string; Icon: typeof CheckCircle2 }> = {
  PASS: { tone: "pass", Icon: CheckCircle2 },
  CONDITIONAL: { tone: "cond", Icon: TriangleAlert },
  FAIL: { tone: "fail", Icon: XCircle },
  NOT_APPLICABLE: { tone: "slate", Icon: MinusCircle },
  NOT_TESTED: { tone: "slate", Icon: CircleDashed },
};

export function VerdictBadge({ v, size = "sm", className }: { v?: string | null; size?: "sm" | "lg"; className?: string }) {
  const k = v ?? "NOT_TESTED";
  const m = VT[k] ?? VT.NOT_TESTED;
  const meta = VERDICT_META[k] ?? { label: k };
  return (
    <Badge tone={m.tone} className={cn(size === "lg" && "px-3 py-1 text-sm", className)}>
      <m.Icon className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {meta.label}
    </Badge>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const m = STATUS_META[s] ?? { label: s, tone: "slate" };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Dot used in dense lists (test list). */
export function VerdictDot({ v }: { v?: string }) {
  const c = v === "PASS" ? "bg-pass-500" : v === "FAIL" ? "bg-fail-500" : v === "CONDITIONAL" ? "bg-cond-500" : v === "NOT_APPLICABLE" ? "bg-slate-300 dark:bg-slate-600" : "bg-transparent ring-2 ring-inset ring-slate-300 dark:ring-slate-600";
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", c)} />;
}
