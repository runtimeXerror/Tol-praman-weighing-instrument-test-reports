"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-navy-600 text-white hover:bg-navy-700 shadow-sm shadow-navy-900/10 active:bg-navy-800",
  accent: "bg-saffron-400 text-navy-950 hover:bg-saffron-500 hover:text-white shadow-sm shadow-saffron-600/20",
  secondary: "surface border border-line text-[var(--text)] hover:bg-navy-50 dark:hover:bg-white/5",
  ghost: "text-[var(--text)] hover:bg-navy-50 dark:hover:bg-white/5",
  danger: "bg-fail-600 text-white hover:bg-fail-700",
  success: "bg-pass-600 text-white hover:bg-pass-700",
  link: "text-navy-600 dark:text-navy-300 underline-offset-4 hover:underline px-0 h-auto",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-xl",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  href?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, href, ...rest },
  ref,
) {
  const cls = cn(
    "inline-flex items-center justify-center font-medium transition-all duration-150 select-none whitespace-nowrap",
    "disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
