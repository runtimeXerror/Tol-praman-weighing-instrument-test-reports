"use client";

import { changePointWarning, indicationWarning, mpeEnvelope, rangesOf, type InstrumentProfile, type RulePack, type TestResult, type WeightItem } from "@tolpraman/engine";
import { ClipboardPaste, Crosshair, FileDown, FileUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { downloadCsv, importRows, templateHeader, toCsv, type ImportResult } from "@/lib/csv";
import { signed } from "@/lib/format";
import { resultOffsets, type Col, type FormSpec, type Section } from "@/lib/forms";
import { cn, getPath, setPath } from "@/lib/utils";
import { VerdictBadge } from "../ui/badge";
import { Field, NumberInput, Select } from "../ui/form";
import { Button } from "../ui/button";
import { Dialog, td, th, TableWrap } from "../ui/misc";
import { ErrorEnvelopeChart } from "../charts";
import { useScale } from "./scale-bar";
import { WeightPicker } from "./weight-picker";

interface Props {
  testId: string;
  spec: FormSpec;
  value: any;
  onChange: (v: any) => void;
  result: TestResult | null;
  inst: InstrumentProfile;
  pack: RulePack;
  weights: WeightItem[];
  readOnly?: boolean;
}

/** Number boxes grow with their value (min 92 px) so long gram values like 60000000 stay fully visible. */
function fitWidth(v: unknown, hasIcon: boolean | undefined): string {
  const chars = v === null || v === undefined || v === "" ? 0 : String(v).length;
  return `max(92px, calc(${chars + 1}ch + ${hasIcon ? 42 : 26}px))`;
}

/** The value column shown next to each input row: what the engine computed for it. */
function primary(r: any): { label: string; value: unknown; limit: unknown } | null {
  if (!r) return null;
  const pick: Array<[string, string, string]> = [
    ["Ec", "Ec", "mpe"], ["durability", "Durab.", "mpe"], ["diff", "EL−E0", "mpe"], ["change", "Δ", "limit"], ["changePerStep", "Δ/step", "limit"],
    ["fault", "Fault", "limit"], ["deviation", "Dev.", "limit"], ["dP", "ΔP", "mpe"], ["E0", "E0", "limit"], ["spread", "Spread", "mpe"],
  ];
  for (const [k, label, lim] of pick) if (typeof r[k] === "number") return { label, value: r[k], limit: r[lim] ?? r.required ?? r.required_mm };
  if (typeof r.required === "number") return { label: "Req.", value: r.change, limit: r.required };
  if (typeof r.required_mm === "number") return { label: "Req.", value: r.displacement_mm, limit: r.required_mm };
  return null;
}

function Cell({ col, row, onSet, readOnly, ctx }: { col: Col; row: any; onSet: (key: string, v: unknown, src?: "DEVICE" | "MANUAL") => void; readOnly?: boolean; ctx: Props }) {
  const scale = useScale();
  const v = getPath(row, col.key);
  const src = row?._src?.[col.key];
  if (col.type === "select") {
    return <Select disabled={readOnly} className="mx-auto h-9 w-[92px] bg-[right_6px_center] pl-2.5 pr-6 text-[13px]" value={v ?? ""} onChange={(e) => onSet(col.key, e.target.value)}>{col.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
  }
  if (col.type === "bool") {
    return (
      <div className="flex justify-center gap-1">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" disabled={readOnly} onClick={() => onSet(col.key, v === b ? undefined : b)}
            className={cn("h-8 rounded-lg px-3 text-xs font-semibold ring-1 ring-inset transition", v === b ? (b ? "bg-pass-600 text-white ring-pass-600" : "bg-fail-600 text-white ring-fail-600") : "ring-line text-muted hover:bg-navy-50 dark:hover:bg-white/5")}>
            {b ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }
  if (col.type === "yesno") {
    return (
      <div className="flex justify-center gap-1">
        {(["yes", "no", "na"] as const).map((b) => (
          <button key={b} type="button" disabled={readOnly} onClick={() => onSet(col.key, v === b ? null : b)}
            className={cn("h-8 rounded-lg px-2.5 text-xs font-semibold uppercase ring-1 ring-inset transition", v === b ? (b === "yes" ? "bg-pass-600 text-white ring-pass-600" : b === "no" ? "bg-fail-600 text-white ring-fail-600" : "bg-slate-500 text-white ring-slate-500") : "ring-line text-muted hover:bg-navy-50 dark:hover:bg-white/5")}>
            {b}
          </button>
        ))}
      </div>
    );
  }
  if (col.type === "text") {
    return <input disabled={readOnly} className={cn("h-9 w-full rounded-lg border border-line surface px-2.5 text-sm focus:border-navy-400 focus:outline-none", col.width)} value={v ?? ""} onChange={(e) => onSet(col.key, e.target.value)} />;
  }
  const capture = () => {
    if (!scale || (scale.status !== "connected" && scale.status !== "simulating")) { toast.info("Connect a scale or start the simulator first."); return; }
    if (scale.status === "simulating") {
      const L = Number(getPath(row, col.key.includes(".") ? col.key.split(".").slice(0, -1).concat("L").join(".") : "L") ?? 0);
      scale.simLoad(Number.isFinite(L) ? L : 0, ctx.inst.e_g);
    }
    const started = Date.now();
    const tryRead = () => {
      const r = scale.last;
      if (r && r.stable && r.at > started) {
        onSet(col.key, +r.value_g.toPrecision(12), "DEVICE");
        toast.success(`Captured ${r.raw.trim()}`);
      } else if (Date.now() - started < 6000) setTimeout(tryRead, 200);
      else toast.error("No stable reading within 6 s");
    };
    tryRead();
  };
  const hasIcon = !readOnly && (col.capture || col.load);
  // Typed-entry checks (warn only; the value is kept as entered).
  const sibling = (k: string) => getPath(row, col.key.includes(".") ? col.key.split(".").slice(0, -1).concat(k).join(".") : k);
  const warn = col.capture ? indicationWarning(ctx.inst, v)
    : col.key === "dL" || col.key.endsWith(".dL") ? changePointWarning(ctx.inst, v, sibling("L")) : null;
  return (
    <div className="flex items-center justify-center gap-1">
      <div className="relative">
        <NumberInput disabled={readOnly} value={v} onChange={(x) => onSet(col.key, x)} className={cn(hasIcon && "pr-7", src === "DEVICE" && "border-navy-300 bg-navy-50/70 dark:bg-navy-900/40", warn && "border-cond-500 ring-1 ring-cond-500")}
          style={{ width: fitWidth(v, hasIcon) }} />
        {!readOnly && col.capture && (
          <button type="button" onClick={capture} title="Capture from scale (only when stable)" className="text-muted absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md hover:bg-navy-50 hover:text-navy-600 dark:hover:bg-white/10">
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        )}
        {!readOnly && col.load && <div className="absolute right-0.5 top-1/2 -translate-y-1/2"><WeightPicker target={v} inst={ctx.inst} pack={ctx.pack} inventory={ctx.weights} onUse={(L) => onSet(col.key, L)} /></div>}
      </div>
      {src === "DEVICE" && <span className="rounded bg-navy-600 px-1 text-[9px] font-bold text-white" title="Captured from the scale">SCALE</span>}
      {warn && <span role="img" aria-label={warn.message} title={`${warn.message} (${warn.clause})`} className="text-cond-600"><TriangleAlert className="h-4 w-4" /></span>}
    </div>
  );
}

function renderSection(s: Section, base: string, p: Props, offsets: Record<string, number>): React.ReactNode {
  const full = (x: string) => (base ? `${base}.${x}` : x);
  const set = (path: string, v: unknown) => p.onChange(setPath(p.value ?? {}, path, v));

  if (s.type === "fields") {
    return (
      <div key={full("fields")} className="flex flex-wrap gap-4">
        {s.fields.map((f) => (
          <Field key={f.key} label={f.label} unit={f.unit} className="w-48">
            {f.type === "bool" ? (
              <div className="flex h-10 items-center gap-1">
                {[true, false].map((b) => {
                  const v = getPath(p.value, full(f.key));
                  return (
                    <button key={String(b)} type="button" disabled={p.readOnly} onClick={() => set(full(f.key), v === b ? undefined : b)}
                      className={cn("h-8 rounded-lg px-3 text-xs font-semibold ring-1 ring-inset transition", v === b ? "bg-navy-600 text-white ring-navy-600" : "ring-line text-muted hover:bg-navy-50 dark:hover:bg-white/5")}>
                      {b ? "Yes" : "No"}
                    </button>
                  );
                })}
              </div>
            ) : f.type === "text" ? (
              <input disabled={p.readOnly} className="h-10 w-full rounded-xl border border-line surface px-3 text-sm" value={getPath(p.value, full(f.key)) ?? ""} onChange={(e) => set(full(f.key), e.target.value)} />
            ) : (
              <NumberInput disabled={p.readOnly} className="h-10" value={getPath(p.value, full(f.key))} onChange={(x) => set(full(f.key), x)} />
            )}
          </Field>
        ))}
      </div>
    );
  }

  if (s.type === "zero") {
    const z = getPath(p.value, full(s.path)) ?? {};
    return (
      <div key={full(s.path)} className="rounded-xl border border-line surface-2 p-3">
        <p className="text-[13px] font-semibold">{s.title}</p>
        {s.hint && <p className="text-muted text-xs">{s.hint}</p>}
        <div className="mt-2 grid grid-cols-3 gap-3 sm:max-w-lg">
          {(["L", "I", "dL"] as const).map((k) => (
            <Field key={k} label={k === "L" ? "L0" : k === "I" ? "I0" : "ΔL"} unit="g">
              <NumberInput disabled={p.readOnly} value={z[k]} onChange={(x) => set(full(`${s.path}.${k}`), x)} />
            </Field>
          ))}
        </div>
      </div>
    );
  }

  if (s.type === "groups") {
    const groups: any[] = getPath(p.value, full(s.path)) ?? [];
    return (
      <div key={full(s.path)} className="space-y-4">
        {groups.map((g, gi) => (
          <div key={gi} className="rounded-2xl border border-line p-4">
            <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-navy-200">{s.groupLabel(g, gi)}</p>
            <div className="mb-3 flex flex-wrap gap-4">
              {s.groupFields.map((f) => (
                <Field key={f.key} label={f.label} unit={f.unit} className="w-44">
                  <NumberInput disabled={p.readOnly} className="h-10" value={g[f.key]} onChange={(x) => set(full(`${s.path}.${gi}.${f.key}`), x)} />
                </Field>
              ))}
            </div>
            <div className="space-y-3">{s.sections.map((ss) => renderSection(ss, full(`${s.path}.${gi}`), p, offsets))}</div>
          </div>
        ))}
      </div>
    );
  }

  // table
  const rows: any[] = getPath(p.value, full(s.path)) ?? [];
  const tablePath = full(s.path);
  const offset = offsets[tablePath] ?? offsets[s.path] ?? 0;
  const inline = s.results === "inline" && p.result;
  const setCell = (ri: number, key: string, v: unknown, source: "DEVICE" | "MANUAL" = "MANUAL") => {
    let next = setPath(p.value ?? {}, `${tablePath}.${ri}.${key}`, v);
    const srcKey = `${tablePath}.${ri}._src`;
    const src = { ...(getPath(next, srcKey) ?? {}) };
    if (source === "DEVICE") src[key] = "DEVICE"; else delete src[key];
    next = setPath(next, srcKey, Object.keys(src).length ? src : undefined);
    p.onChange(next);
  };
  return (
    <div key={tablePath}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {s.title ? <p className="text-[13px] font-semibold">{s.title}</p> : <span />}
        <TableTools cols={s.columns} rows={rows} results={inline ? rows.map((_, ri) => p.result!.rows[offset + ri]) : null} name={`${p.testId}${s.title ? "-" + s.title : ""}`}
          readOnly={p.readOnly} onImport={(next) => p.onChange(setPath(p.value ?? {}, tablePath, next))} />
      </div>
      <TableWrap className="rounded-xl border border-line">
        <table className="w-full">
          <thead className="surface-2 border-b border-line">
            <tr>
              <th className={cn(th, "w-10 text-center")}>#</th>
              {s.columns.map((c) => <th key={c.key} className={cn(th, "whitespace-normal text-center leading-tight")}>{c.label}{c.unit && <span className="block font-normal normal-case tracking-normal">({c.unit})</span>}</th>)}
              {inline && <><th className={cn(th, "text-center leading-tight")}>Result<span className="block font-normal normal-case tracking-normal">(g)</span></th><th className={cn(th, "text-center leading-tight")}>Limit<span className="block font-normal normal-case tracking-normal">(g)</span></th><th className={cn(th, "text-center leading-tight")}>U<span className="block font-normal normal-case tracking-normal">(g)</span></th><th className={cn(th, "text-center")}>Verdict</th></>}
              {!p.readOnly && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const r: any = inline ? p.result!.rows[offset + ri] : null;
              const pv = primary(r);
              return (
                <tr key={ri} className={cn("border-b border-line last:border-0", r?.verdict === "FAIL" && "bg-fail-50/70 dark:bg-fail-700/10", r?.verdict === "CONDITIONAL" && "bg-cond-50/80 dark:bg-cond-700/10")}>
                  <td className={cn(td, "text-muted text-center text-xs")}>{ri + 1}</td>
                  {s.columns.map((c) => (
                    <td key={c.key} className="px-2 py-1.5 text-center">
                      <Cell col={c} row={row} readOnly={p.readOnly} ctx={p} onSet={(k, v, src) => setCell(ri, k, v, src)} />
                    </td>
                  ))}
                  {inline && (
                    <>
                      <td className={cn(td, "tabular text-center font-semibold")}>{pv ? <><span className="text-muted mr-1 text-[11px] font-normal">{pv.label}</span>{signed(pv.value)}</> : "—"}</td>
                      <td className={cn(td, "tabular text-center text-muted")}>{pv && typeof pv.limit === "number" ? `±${+(pv.limit as number).toPrecision(10)}` : "—"}</td>
                      <td className={cn(td, "tabular text-center text-muted")}>{typeof r?.U === "number" ? r.U.toFixed(2) : "—"}</td>
                      <td className={cn(td, "text-center")}>{r ? <VerdictBadge v={r.verdict} /> : null}</td>
                    </>
                  )}
                  {!p.readOnly && (
                    <td className="px-1">
                      <button type="button" onClick={() => p.onChange(setPath(p.value, tablePath, rows.filter((_, k) => k !== ri)))} className="text-muted grid h-7 w-7 place-items-center rounded-lg hover:bg-fail-50 hover:text-fail-600" title="Remove row">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {!p.readOnly && (
        <button type="button" onClick={() => p.onChange(setPath(p.value ?? {}, tablePath, [...rows, s.newRow ? s.newRow() : {}]))}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-navy-600 hover:bg-navy-50 dark:text-navy-200 dark:hover:bg-white/5">
          <Plus className="h-3.5 w-3.5" /> {s.addLabel ?? "Add row"}
        </button>
      )}
    </div>
  );
}

/** Export a table (inputs + results) to CSV, or import rows from a CSV file or cells pasted from Excel. */
function TableTools({ cols, rows, results, name, readOnly, onImport }: { cols: Col[]; rows: any[]; results: any[] | null; name: string; readOnly?: boolean; onImport: (rows: any[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const parsed: ImportResult | null = text.trim() ? importRows(cols, text) : null;
  const fname = name.replace(/[^\w-]+/g, "_");

  const exportCsv = () => {
    const head = [...templateHeader(cols), ...(results ? ["Result", "Result value (g)", "Limit ± (g)", "U (g)", "Verdict"] : [])];
    const body = rows.map((row, k) => {
      const r = results?.[k];
      const pv = primary(r);
      return [...cols.map((c) => getPath(row, c.key)), ...(results ? [pv?.label, pv?.value, pv?.limit, r?.U, r?.verdict] : [])];
    });
    downloadCsv(`${fname}.csv`, toCsv(head, body));
  };
  const apply = (mode: "replace" | "add") => {
    if (!parsed?.rows.length) return;
    onImport(mode === "replace" ? parsed.rows : [...rows, ...parsed.rows]);
    toast.success(`${parsed.rows.length} row${parsed.rows.length > 1 ? "s" : ""} imported. Check them before saving.`);
    setOpen(false);
    setText("");
  };
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-navy-600 hover:bg-navy-50 dark:text-navy-200 dark:hover:bg-white/5";
  return (
    <div className="flex items-center gap-1">
      {!readOnly && <button type="button" className={btn} onClick={() => setOpen(true)}><FileUp className="h-3.5 w-3.5" /> Import</button>}
      {rows.length > 0 && <button type="button" className={btn} onClick={exportCsv} title="Download as CSV (opens in Excel)"><FileDown className="h-3.5 w-3.5" /> Export CSV</button>}
      <Dialog open={open} onClose={() => setOpen(false)} wide title="Import readings"
        subtitle="Paste cells copied from Excel, or choose a CSV file. The first row may be a header (column names below); without one, columns are read in this order."
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="secondary" disabled={!parsed?.rows.length} onClick={() => apply("add")}>Add to table</Button>
          <Button disabled={!parsed?.rows.length} onClick={() => apply("replace")}>Replace table</Button>
        </>}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted text-xs">Columns:</span>
            {templateHeader(cols).map((h) => <code key={h} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-white/10">{h}</code>)}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false}
            placeholder={`${templateHeader(cols).join(", ")}\n…`} className="w-full rounded-xl border border-line surface p-3 font-mono text-xs focus:border-navy-400 focus:outline-none" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => file.current?.click()}><FileUp className="h-3.5 w-3.5" /> Choose CSV file</Button>
            <Button size="sm" variant="secondary" onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { toast.info("Press Ctrl+V in the box to paste."); } }}><ClipboardPaste className="h-3.5 w-3.5" /> Paste from clipboard</Button>
            <Button size="sm" variant="ghost" onClick={() => downloadCsv(`${fname}-template.csv`, toCsv(templateHeader(cols), []))}><FileDown className="h-3.5 w-3.5" /> Empty template</Button>
            <input ref={file} type="file" accept=".csv,.txt,.tsv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
          </div>
          {parsed && (
            <div className={cn("rounded-xl p-3 text-xs", parsed.problems.length ? "bg-cond-50 text-cond-800 dark:bg-cond-700/15 dark:text-cond-100" : "bg-pass-50 text-pass-800 dark:bg-pass-700/15 dark:text-pass-100")}>
              <p className="font-semibold">{parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready{parsed.matched.length ? ` · columns: ${parsed.matched.join(", ")}` : ""}</p>
              {parsed.problems.slice(0, 6).map((x) => <p key={x}>{x}</p>)}
              {parsed.problems.length > 6 && <p>…and {parsed.problems.length - 6} more.</p>}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}

/** Generic, spec-driven test entry form. */
export function TestForm(p: Props) {
  const offsets = resultOffsets(p.testId, p.value);
  return (
    <div className="space-y-5">
      {p.spec.intro && <p className="text-muted rounded-xl bg-navy-50/60 px-3 py-2 text-[13px] dark:bg-white/5">{p.spec.intro}</p>}
      {p.spec.sections.map((s) => renderSection(s, "", p, offsets))}
      {p.spec.computedTable && p.result && p.result.rows.length > 0 && <ComputedTable result={p.result} />}
      {p.testId === "T01" && p.result && <ErrorChart result={p.result} inst={p.inst} pack={p.pack} />}
    </div>
  );
}

/** T01: plot each Ec against the ±mpe envelope from the same rule pack. */
function ErrorChart({ result, inst, pack }: { result: TestResult; inst: InstrumentProfile; pack: RulePack }) {
  const points = result.rows
    .filter((r: any) => typeof r.Ec === "number" && typeof r.L === "number" && typeof r.mpe === "number")
    .map((r: any) => ({ L: r.L, Ec: r.Ec, mpe: r.mpe, U: r.U, dir: r.dir === "down" ? "down" as const : "up" as const, verdict: r.verdict }));
  if (!points.length) return null;
  let steps;
  try { steps = mpeEnvelope(inst, pack); } catch { return null; }
  return <ErrorEnvelopeChart steps={steps} points={points} max_g={rangesOf(inst).at(-1)!.max_g} />;
}

const KIND: Record<string, string> = { initial_range: "Initial zero-setting range", overall_range: "Zero-setting + zero-tracking range", accuracy: "Zero-setting accuracy" };

const SHOW: Array<[string, string]> = [
  ["kind", "Check"], ["range_g", "Range (g)"], ["pct", "% of Max"], ["limit_pct", "Limit (% Max)"], ["E0", "E0 (g)"],
  ["series", "Series"], ["L", "L (g)"], ["n", "n"], ["E0_before", "E0 before"], ["E0_after", "E0 after"], ["Emax", "Emax"], ["Emin", "Emin"],
  ["spread", "Emax−Emin"], ["change", "Change"], ["s", "s (u_rep)"], ["mpe", "mpe"], ["limit", "Limit"],
];

export function ComputedTable({ result }: { result: TestResult }) {
  const cols = SHOW.filter(([k]) => result.rows.some((r: any) => typeof r[k] === "number" || (k === "kind" && typeof r[k] === "string")));
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold">Calculated results</p>
      <TableWrap className="rounded-xl border border-line">
        <table className="w-full">
          <thead className="surface-2 border-b border-line"><tr>{cols.map(([, l]) => <th key={l} className={cn(th, "text-center")}>{l}</th>)}<th className={cn(th, "text-center")}>Verdict</th></tr></thead>
          <tbody>
            {result.rows.map((r: any, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {cols.map(([k]) => <td key={k} className={cn(td, "tabular text-center")}>{k === "kind" ? KIND[r.kind] ?? r.kind ?? "—" : typeof r[k] === "number" ? (k === "range_g" || k === "pct" || k === "limit_pct" ? +r[k].toPrecision(6) : signed(r[k])) : "—"}</td>)}
                <td className={cn(td, "text-center")}><VerdictBadge v={r.verdict} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
