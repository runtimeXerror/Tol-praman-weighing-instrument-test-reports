"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/40", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cn("h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-navy-600", className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="bg-grid-light flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-navy-600 dark:bg-navy-900/50 dark:text-navy-200">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="text-muted mt-1 max-w-md text-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "navy", onClick, active, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "navy" | "saffron" | "pass" | "cond" | "fail" | "violet"; onClick?: () => void; active?: boolean; href?: string }) {
  const ring: Record<string, string> = {
    navy: "from-navy-500/15 text-navy-600 dark:text-navy-200",
    saffron: "from-saffron-400/20 text-saffron-600 dark:text-saffron-300",
    pass: "from-pass-500/15 text-pass-600 dark:text-pass-100",
    cond: "from-cond-500/15 text-cond-600 dark:text-cond-100",
    fail: "from-fail-500/15 text-fail-600 dark:text-fail-100",
    violet: "from-violet-500/15 text-violet-600 dark:text-violet-200",
  };
  const El: any = href ? Link : onClick ? "button" : "div";
  return (
    <El href={href} onClick={onClick} className={cn("card group relative block overflow-hidden p-4 text-left transition", (onClick || href) && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lift", active && "ring-2 ring-navy-500")}>
      <div className={cn("pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br to-transparent", ring[tone])} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted text-[12.5px] font-medium">{label}</p>
        {icon && <div className={cn("relative", ring[tone].split(" ").slice(1).join(" "))}>{icon}</div>}
      </div>
      <p className="tabular mt-2 text-[28px] font-bold leading-none tracking-tight">{value}</p>
      {hint && <p className="text-muted mt-1.5 text-xs">{hint}</p>}
    </El>
  );
}

export function Dialog({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal className={cn("card relative z-10 flex max-h-[92dvh] w-full flex-col rounded-b-none animate-slide-up sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted rounded-lg p-1 hover:bg-navy-50 dark:hover:bg-white/5" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: React.ReactNode; count?: number | string }>; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("scrollbar-thin flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-white/5", className)}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
            value === t.id ? "surface text-navy-700 shadow-sm dark:text-white" : "text-muted hover:text-[var(--text)]")}>
          {t.label}
          {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px]", value === t.id ? "bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-navy-100" : "bg-slate-200 dark:bg-white/10")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Horizontal-scroll wrapper for wide tables on narrow screens. */
export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("scrollbar-thin -mx-px overflow-x-auto", className)}>{children}</div>;
}

export const th = "px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap";
export const td = "px-3 py-2.5 text-sm whitespace-nowrap";

export function ProgressBar({ value, className, tone = "navy" }: { value: number; className?: string; tone?: "navy" | "pass" | "saffron" }) {
  const c = tone === "pass" ? "bg-pass-500" : tone === "saffron" ? "bg-saffron-400" : "bg-navy-600";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
