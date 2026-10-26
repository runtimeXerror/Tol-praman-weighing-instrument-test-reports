import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...p} />;
}

export function CardHeader({ title, subtitle, icon, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-600 dark:bg-navy-900/60 dark:text-navy-200">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-6">{title}</h3>
          {subtitle && <p className="text-muted text-[13px] leading-5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...p} />;
}

export function PageHeader({ title, subtitle, actions, eyebrow, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 animate-slide-up">
      {back && <Link href={back.href} className="text-muted mb-3 inline-flex items-center gap-1.5 text-sm hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" /> {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-saffron-600">{eyebrow}</div>}
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">
            {title}
          </h1>
          {subtitle && <p className="text-muted mt-1 max-w-3xl text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
