import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <defs>
        <linearGradient id="lg-n" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a58b8" />
          <stop offset="1" stopColor="#034597" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg-n)" />
      <path d="M32 13v33" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="13" r="3.2" fill="#fff" />
      <path d="M13 21h38" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M13 21l-6.5 13h13z" fill="#FF904D" />
      <path d="M51 21l-6.5 13h13z" fill="#FF904D" />
      <path d="M22 50h20" stroke="#FF904D" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <div className="leading-tight">
          <div className={cn("text-[17px] font-extrabold tracking-[0.08em]", light ? "text-white" : "text-navy-700 dark:text-white")}>TOLPRAMAN</div>
          <div className={cn("text-[11px] font-medium", light ? "text-navy-200" : "text-muted")}>NAWI Test Reports</div>
        </div>
      )}
    </div>
  );
}
