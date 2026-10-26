"use client";

import { chooseWeights, checkThirdMpe, type InstrumentProfile, type RulePack, type WeightItem } from "@tolpraman/engine";
import { Check, Weight as WeightIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

/** Suggests the minimum set of valid weights for a load and applies the conventional mass as L. */
export function WeightPicker({ target, inst, pack, inventory, onUse }: { target: number | null | undefined; inst: InstrumentProfile; pack: RulePack; inventory: WeightItem[]; onUse: (L: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (!target || target <= 0 || !inventory.length) return null;
  const sel = open ? chooseWeights(target, inventory) : null;
  const third = sel?.ok ? checkThirdMpe(target, sel.items, inst, pack) : null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} title="Choose test weights"
        className="text-muted grid h-6 w-6 place-items-center rounded-md hover:bg-navy-50 hover:text-navy-600 dark:hover:bg-white/10">
        <WeightIcon className="h-3.5 w-3.5" />
      </button>
      {open && sel && (
        <div className="card absolute right-0 top-8 z-40 w-80 p-3 text-left shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Weights for {mass(target)}</p>
            <button onClick={() => setOpen(false)} className="text-muted"><X className="h-4 w-4" /></button>
          </div>
          {!sel.ok ? (
            <p className="mt-2 text-xs text-fail-600">{sel.message}</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sel.items.map((w) => <Badge key={w.id} tone="navy">{w.id} · {w.class}</Badge>)}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Nominal</dt><dd className="tabular text-right">{sel.nominal_g} g</dd>
                <dt className="text-muted">Conventional mass</dt><dd className="tabular text-right font-semibold">{sel.conventional_g} g</dd>
                <dt className="text-muted">U (k=2), sum</dt><dd className="tabular text-right">{sel.U_g} g</dd>
              </dl>
              {third && (
                <p className={cn("mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs", third.ok ? "bg-pass-50 text-pass-700 dark:bg-pass-700/20 dark:text-pass-100" : "bg-fail-50 text-fail-700 dark:bg-fail-700/20 dark:text-fail-100")}>
                  {third.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{third.message} <span className="opacity-70">({third.clause})</span></span>
                </p>
              )}
              <Button size="sm" className="mt-3 w-full" disabled={!third?.ok} onClick={() => { onUse(sel.conventional_g); setOpen(false); }}>
                Use L = {sel.conventional_g} g (conventional mass)
              </Button>
              <p className="text-muted mt-2 text-[11px]">Expired weights are excluded automatically.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
