"use client";

import { validateInstrument, type RulePack } from "@tolpraman/engine";
import { AlertCircle, CheckCircle2, Info, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { mass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Field, Input, NumberInput, Select, Switch } from "../ui/form";

export interface CaseParty { name?: string; address?: string; country?: string }

export function toProfile(i: any) {
  return {
    cls: i.cls ?? "III", max_g: Number(i.max_g ?? 0), min_g: Number(i.min_g ?? 0), e_g: Number(i.e_g ?? 0), d_g: Number(i.d_g ?? i.e_g ?? 0),
    ranges: i.ranges?.length ? i.ranges : undefined, rangeKind: i.rangeKind, indication: i.indication ?? "digital", power: i.power ?? "mains",
    electronic: i.electronic ?? true, directSale: !!i.directSale, software: !!i.software, liableToTilt: i.liableToTilt ?? true, hasTare: !!i.hasTare,
    maxTare_g: i.maxTare_g, maxAdditiveTare_g: i.maxAdditiveTare_g, supports: i.supports, receptor: i.receptor ?? "normal", grading: !!i.grading,
    tempLow_C: i.tempLow_C, tempHigh_C: i.tempHigh_C, levelIndicator: i.levelIndicator, tiltSensor: i.tiltSensor,
  } as const;
}

const UNIT_F = { t: 1e6, kg: 1000, g: 1, mg: 0.001 } as const;
type MassUnit = keyof typeof UNIT_F;

/** Mass input with a unit selector (stored in grams). The unit never changes while typing. */
function MassInput({ value, onChange, disabled }: { value: number | undefined; onChange: (g: number | null) => void; disabled?: boolean }) {
  const [unit, setUnit] = useState<MassUnit>(() => (value === undefined ? "g" : value >= 1e6 ? "t" : value >= 1000 ? "kg" : value > 0 && value < 1 ? "mg" : "g"));
  const f = UNIT_F[unit];
  return (
    <div className="flex">
      <NumberInput disabled={disabled} className="h-10 rounded-r-none" value={value === undefined ? null : +(value / f).toPrecision(12)} onChange={(x) => onChange(x === null ? null : +(x * f).toPrecision(12))} />
      <select disabled={disabled} value={unit} onChange={(e) => setUnit(e.target.value as MassUnit)} aria-label="Unit"
        className="surface-2 text-muted w-14 rounded-r-xl border border-l-0 border-line px-1 text-xs font-semibold focus:outline-none">
        {(Object.keys(UNIT_F) as MassUnit[]).map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}

export function InstrumentForm({ inst, onChange, manufacturer, onManufacturer, applicationNo, onApplicationNo, pack, readOnly }: {
  inst: any; onChange: (i: any) => void; manufacturer: CaseParty; onManufacturer: (m: CaseParty) => void; applicationNo?: string; onApplicationNo: (s: string) => void; pack: RulePack; readOnly?: boolean;
}) {
  const v = useMemo(() => { try { return validateInstrument(toProfile(inst) as any, pack); } catch { return null; } }, [inst, pack]);
  const set = (k: string, x: unknown) => onChange({ ...inst, [k]: x === null ? undefined : x });
  const multi = (inst.ranges?.length ?? 0) > 0;
  const classes = pack.accuracy_classes;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Manufacturer & identification" subtitle="Auto-populates the report header" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Manufacturer"><Input disabled={readOnly} value={manufacturer.name ?? ""} onChange={(e) => onManufacturer({ ...manufacturer, name: e.target.value })} /></Field>
            <Field label="Application no."><Input disabled={readOnly} value={applicationNo ?? ""} onChange={(e) => onApplicationNo(e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input disabled={readOnly} value={manufacturer.address ?? ""} onChange={(e) => onManufacturer({ ...manufacturer, address: e.target.value })} /></Field>
            <Field label="Type of instrument"><Input disabled={readOnly} value={inst.type ?? ""} onChange={(e) => set("type", e.target.value)} placeholder="Electronic platform scale" /></Field>
            <Field label="Model / type designation"><Input disabled={readOnly} value={inst.model ?? ""} onChange={(e) => set("model", e.target.value)} /></Field>
            <Field label="Serial no."><Input disabled={readOnly} value={inst.serialNo ?? ""} onChange={(e) => set("serialNo", e.target.value)} /></Field>
            <Field label="Software version"><Input disabled={readOnly} value={inst.softwareVersion ?? ""} onChange={(e) => set("softwareVersion", e.target.value)} /></Field>
            <Field label="Load cell"><Input disabled={readOnly} value={inst.loadCell ?? ""} onChange={(e) => set("loadCell", e.target.value)} placeholder="Type, OIML R60 certificate" /></Field>
            <Field label="Indicator"><Input disabled={readOnly} value={inst.indicator ?? ""} onChange={(e) => set("indicator", e.target.value)} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Metrological characteristics" subtitle={`Validated live against ${pack.accuracy_classes[0]?.clause}`} />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Accuracy class">
              <Select disabled={readOnly} value={inst.cls ?? "III"} onChange={(e) => set("cls", e.target.value)}>
                {classes.map((c) => <option key={c.id} value={c.id}>Class {c.display} · {c.name}</option>)}
              </Select>
            </Field>
            <Field label="Maximum capacity (Max)"><MassInput disabled={readOnly} value={inst.max_g} onChange={(x) => set("max_g", x)} /></Field>
            <Field label="Minimum capacity (Min)"><MassInput disabled={readOnly} value={inst.min_g} onChange={(x) => set("min_g", x)} /></Field>
            <Field label="Verification scale interval e"><MassInput disabled={readOnly} value={inst.e_g} onChange={(x) => set("e_g", x)} /></Field>
            <Field label="Actual scale interval d"><MassInput disabled={readOnly} value={inst.d_g} onChange={(x) => set("d_g", x)} /></Field>
            <Field label="Indication">
              <Select disabled={readOnly} value={inst.indication ?? "digital"} onChange={(e) => set("indication", e.target.value)}>
                <option value="digital">Digital (self-indicating)</option><option value="analog">Analog (self-indicating)</option><option value="non_self">Non-self-indicating</option>
              </Select>
            </Field>
            <Field label="Power supply">
              <Select disabled={readOnly} value={inst.power ?? "mains"} onChange={(e) => set("power", e.target.value)}>
                <option value="mains">AC mains</option><option value="external_dc">External / plug-in DC</option><option value="battery">Battery</option><option value="vehicle">Vehicle battery 12/24 V</option>
              </Select>
            </Field>
            <Field label="Nominal voltage Unom" unit="V"><NumberInput disabled={readOnly} className="h-10" value={inst.Unom_V} onChange={(x) => set("Unom_V", x)} /></Field>
            <Field label="Temperature range" unit="°C">
              <div className="flex items-center gap-2">
                <NumberInput disabled={readOnly} className="h-10" value={inst.tempLow_C ?? -10} onChange={(x) => set("tempLow_C", x)} />
                <span className="text-muted">to</span>
                <NumberInput disabled={readOnly} className="h-10" value={inst.tempHigh_C ?? 40} onChange={(x) => set("tempHigh_C", x)} />
              </div>
            </Field>
            <Field label="Max tare" hint="Subtractive tare range"><MassInput disabled={readOnly} value={inst.maxTare_g} onChange={(x) => set("maxTare_g", x)} /></Field>
            <Field label="Max additive tare T+" hint="Used for the eccentricity load"><MassInput disabled={readOnly} value={inst.maxAdditiveTare_g} onChange={(x) => set("maxAdditiveTare_g", x)} /></Field>
            <Field label="Load receptor">
              <div className="flex gap-2">
                <Select disabled={readOnly} value={inst.receptor ?? "normal"} onChange={(e) => set("receptor", e.target.value)}>
                  <option value="normal">Normal</option><option value="special">Tank / hopper</option><option value="rolling">Rolling loads</option>
                </Select>
                <NumberInput disabled={readOnly} className="h-10 w-20" placeholder="supports" value={inst.supports} onChange={(x) => set("supports", x)} />
              </div>
            </Field>
          </CardBody>
          <div className="grid grid-cols-1 gap-4 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            <Switch disabled={readOnly} checked={inst.electronic ?? true} onChange={(x) => set("electronic", x)} label="Electronic instrument" description="Annex B tests apply" />
            <Switch disabled={readOnly} checked={inst.liableToTilt ?? true} onChange={(x) => set("liableToTilt", x)} label="Liable to be tilted" description="Not fixed / suspended" />
            <Switch disabled={readOnly} checked={!!inst.levelIndicator} onChange={(x) => set("levelIndicator", x)} label="Level indicator fitted" />
            <Switch disabled={readOnly} checked={!!inst.hasTare} onChange={(x) => set("hasTare", x)} label="Tare device" />
            <Switch disabled={readOnly} checked={!!inst.directSale} onChange={(x) => set("directSale", x)} label="Direct sales to the public" />
            <Switch disabled={readOnly} checked={!!inst.software} onChange={(x) => set("software", x)} label="Software-controlled" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Multi-interval / multiple range" subtitle="Leave empty for a single-range instrument"
            actions={!readOnly && <button className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 dark:text-navy-200" onClick={() => set("ranges", [...(inst.ranges ?? (inst.max_g ? [{ max_g: inst.max_g, e_g: inst.e_g }] : [])), { max_g: undefined, e_g: undefined }])}><Plus className="h-4 w-4" /> Add range</button>} />
          {multi && (
            <CardBody className="space-y-3">
              <Select disabled={readOnly} className="max-w-xs" value={inst.rangeKind ?? "multi_interval"} onChange={(e) => set("rangeKind", e.target.value)}>
                <option value="multi_interval">Multi-interval (partial weighing ranges)</option><option value="multiple_range">Multiple range</option>
              </Select>
              {(inst.ranges ?? []).map((r: any, k: number) => (
                <div key={k} className="flex flex-wrap items-end gap-3">
                  <Badge tone="navy">Range {k + 1}</Badge>
                  <Field label={`Max${k + 1}`} className="w-44"><MassInput disabled={readOnly} value={r.max_g} onChange={(x) => set("ranges", inst.ranges.map((rr: any, j: number) => (j === k ? { ...rr, max_g: x } : rr)))} /></Field>
                  <Field label={`e${k + 1}`} className="w-40"><MassInput disabled={readOnly} value={r.e_g} onChange={(x) => set("ranges", inst.ranges.map((rr: any, j: number) => (j === k ? { ...rr, e_g: x } : rr)))} /></Field>
                  {!readOnly && <button className="text-muted mb-2 hover:text-fail-600" onClick={() => set("ranges", inst.ranges.filter((_: any, j: number) => j !== k))}><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      {/* Live validation */}
      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card className="overflow-hidden">
          <div className={cn("px-5 py-4 text-white", v?.valid ? "bg-gradient-to-br from-pass-600 to-pass-700" : "bg-gradient-to-br from-navy-600 to-navy-800")}>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Live validation</p>
            <div className="mt-1 flex items-center gap-2 text-lg font-bold">
              {v?.valid ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              {v?.valid ? "Instrument data valid" : "Check instrument data"}
            </div>
          </div>
          <CardBody className="space-y-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl surface-2 p-3"><dt className="text-muted text-xs">Class</dt><dd className="text-lg font-bold">{v?.classDisplay ?? "—"}</dd></div>
              <div className="rounded-xl surface-2 p-3"><dt className="text-muted text-xs">n = Max / e</dt><dd className="tabular text-lg font-bold">{Number.isFinite(v?.n) ? v!.n.toLocaleString("en-IN") : "—"}</dd></div>
              <div className="rounded-xl surface-2 p-3"><dt className="text-muted text-xs">Min required</dt><dd className="tabular font-semibold">{mass(v?.minRequired_g)}</dd></div>
              <div className="rounded-xl surface-2 p-3"><dt className="text-muted text-xs">Band</dt><dd className="tabular text-xs font-semibold">{v?.ranges[0]?.band ? `n ${v.ranges[0].band.n_min}–${v.ranges[0].band.n_max ?? "∞"} · Min ${v.ranges[0].band.min_capacity_e} e` : "—"}</dd></div>
            </dl>
            {v?.issues.length ? (
              <ul className="space-y-2">
                {v.issues.map((i, k) => (
                  <li key={k} className={cn("flex gap-2 rounded-xl p-2.5 text-xs", i.severity === "error" ? "bg-fail-50 text-fail-700 dark:bg-fail-700/15 dark:text-fail-100" : i.severity === "warning" ? "bg-cond-50 text-cond-700 dark:bg-cond-700/15 dark:text-cond-100" : "bg-navy-50 text-navy-700 dark:bg-navy-900/40 dark:text-navy-100")}>
                    {i.severity === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <span>{i.message}<span className="mt-0.5 block opacity-70">{i.clause}</span></span>
                  </li>
                ))}
              </ul>
            ) : v ? <p className="text-muted text-xs">All checks of Table 3 / Table 17, scale-interval form and Min passed.</p> : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
