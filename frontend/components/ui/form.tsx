"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-line surface px-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/70 transition " +
  "focus:border-navy-400 focus:ring-4 focus:ring-navy-500/10 focus:outline-none disabled:opacity-60 disabled:bg-[var(--surface-2)]";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} className={cn(base, "h-10", invalid && "border-fail-500 focus:border-fail-500 focus:ring-fail-500/10", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-24 py-2.5", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(base, "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b6b82' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p}>
      {children}
    </select>
  );
});

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium", className)} {...p} />;
}

export function Field({ label, hint, error, children, className, unit }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; unit?: string }) {
  return (
    <div className={className}>
      <Label>
        {label}
        {unit && <span className="text-muted ml-1 font-normal">({unit})</span>}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-fail-600">{error}</p> : hint ? <p className="text-muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition", checked ? "bg-navy-600" : "bg-slate-300 dark:bg-slate-600")}>
        <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition", checked ? "translate-x-4.5" : "translate-x-0.5")} />
      </button>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium">{label}</span>}
          {description && <span className="text-muted block text-xs">{description}</span>}
        </span>
      )}
    </label>
  );
}

/** Number input that keeps the user's text while typing and reports a number (or null). */
export function NumberInput({ value, onChange, className, ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      className={cn(base, "h-9 tabular text-right", className)}
      value={value === null || value === undefined || Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      {...p}
    />
  );
}
