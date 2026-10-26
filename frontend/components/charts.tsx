"use client";

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

/** Validated categorical pair (dataviz validator: light + dark, CVD ΔE 25.5, contrast ≥ 3:1). */
export const SERIES = { created: "#3f76cf", signed: "#d95a0c" } as const;

const monthLabel = (m: string) => new Date(m + "-01").toLocaleString("en-IN", { month: "short" });

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="text-muted mb-1 font-medium">{new Date(label + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" })}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          <b className="tabular">{p.value}</b>
          <span className="text-muted">{p.dataKey === "created" ? "cases opened" : "reports signed"}</span>
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ data }: { data: Array<{ month: string; created: number; signed: number }> }) {
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.created }} /> Cases opened</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.signed }} /> Reports signed</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "var(--border)", opacity: 0.35 }} />
            <Bar dataKey="created" fill={SERIES.created} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="signed" fill={SERIES.signed} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bar list with visible counts (status colours always carry a label). */
export function FailureBars({ rows }: { rows: Array<{ testId: string; name: string; fail: number; conditional: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.fail + r.conditional));
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fail-600" /> Fail</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cond-500" /> Conditional</span>
      </div>
      {rows.slice(0, 8).map((r) => (
        <div key={r.testId} className="group" title={`${r.testId} ${r.name}: ${r.fail} fail, ${r.conditional} conditional`}>
          <div className="mb-1 flex justify-between gap-2 text-[12.5px]">
            <span className="truncate"><span className="text-muted mr-1.5 font-mono text-[11px]">{r.testId}</span>{r.name}</span>
            <span className="tabular shrink-0 font-semibold">{r.fail} <span className="text-muted font-normal">/</span> {r.conditional}</span>
          </div>
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
            {r.fail > 0 && <div className="h-full rounded-l-full bg-fail-600 transition-all group-hover:brightness-110" style={{ width: `${(r.fail / max) * 100}%` }} />}
            {r.conditional > 0 && <div className="h-full rounded-r-full bg-cond-500 transition-all group-hover:brightness-110" style={{ width: `${(r.conditional / max) * 100}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Error vs load with the ±MPE envelope (T01 weighing performance) ---------------- */

type EnvStep = { from_g: number; to_g: number; mpe_g: number };
type ErrPoint = { L: number; Ec: number; mpe: number; U?: number | null; dir: "up" | "down"; verdict: string };

/** Direction pair = the validated categorical pair; shape (circle / triangle) also carries direction. */
const DIR = { up: SERIES.created, down: SERIES.signed } as const;
const num = (v: number) => String(+v.toPrecision(6));
/** Smallest 1 / 2 / 2.5 / 5 x 10^k at or above x, so the half-way tick is also a round number. */
const niceTop = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(x));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= x - 1e-12) ?? 10) * p;
};

function ErrTooltip({ active, payload, unit }: any) {
  const p: ErrPoint | undefined = active && payload?.find((x: any) => x.payload?.Ec !== undefined)?.payload;
  if (!p) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{p.dir === "up" ? "Increasing" : "Decreasing"} load · L = {num(p.L / unit.f)} {unit.s}</p>
      <p className="tabular">Ec <b>{p.Ec > 0 ? "+" : ""}{num(p.Ec)} g</b> <span className="text-muted">· limit ±{num(p.mpe)} g{p.U ? ` · U ${num(p.U)} g` : ""}</span></p>
      <p className="text-muted mt-0.5">{p.verdict === "PASS" ? "Within MPE" : p.verdict === "CONDITIONAL" ? "Conditional: within MPE but uncertainty overlaps the limit" : p.verdict === "FAIL" ? "Outside MPE" : p.verdict}</p>
    </div>
  );
}

const Triangle = (props: any) => {
  const { cx, cy, fill } = props;
  return <path d={`M${cx},${cy - 5.5} L${cx + 5.5},${cy + 4} L${cx - 5.5},${cy + 4} Z`} fill={fill} stroke="var(--card)" strokeWidth={2} />;
};
const Dot = (props: any) => <circle cx={props.cx} cy={props.cy} r={4.5} fill={props.fill} stroke="var(--card)" strokeWidth={2} />;

export function ErrorEnvelopeChart({ steps, points, max_g }: { steps: EnvStep[]; points: ErrPoint[]; max_g: number }) {
  const unit = max_g >= 1e6 ? { f: 1e6, s: "t" } : max_g >= 1000 ? { f: 1000, s: "kg" } : { f: 1, s: "g" };
  const band = [...steps.map((s) => ({ L: s.from_g, band: [-s.mpe_g, s.mpe_g] })), { L: max_g, band: [-steps.at(-1)!.mpe_g, steps.at(-1)!.mpe_g] }];
  const top = niceTop(Math.max(...steps.map((s) => s.mpe_g), ...points.map((p) => Math.abs(p.Ec))) * 1.1);
  const yTicks = [-top, -top / 2, 0, top / 2, top];
  const up = points.filter((p) => p.dir === "up");
  const down = points.filter((p) => p.dir === "down");
  const outside = points.filter((p) => p.verdict === "FAIL").length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">Error vs load <span className="text-muted font-normal">(Ec against the ±MPE limit)</span></p>
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill={DIR.up} /></svg> Increasing</span>
          <span className="flex items-center gap-1.5"><svg width="11" height="10"><path d="M5.5,0 L11,9.5 L0,9.5 Z" fill={DIR.down} /></svg> Decreasing</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-slate-400 bg-slate-200/70 dark:bg-white/10" /> ±MPE</span>
        </div>
      </div>
      <div className="h-64 rounded-xl border border-line p-2" role="img" aria-label={`Error versus load: ${points.length} points, ${outside} outside the MPE limit`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis type="number" dataKey="L" domain={[0, max_g]} tickFormatter={(v) => num(v / unit.f)} tickLine={false} axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted)", fontSize: 11 }} label={{ value: `Load (${unit.s})`, position: "insideBottomRight", offset: -2, fill: "var(--muted)", fontSize: 11 }} height={34} />
            <YAxis type="number" domain={[-top, top]} ticks={yTicks} tickFormatter={(v) => num(v)} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} width={56}
              label={{ value: "Ec (g)", angle: -90, position: "insideLeft", offset: 12, fill: "var(--muted)", fontSize: 11 }} />
            <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.5} />
            <Area data={band} dataKey="band" type="stepAfter" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} fill="#94a3b8" fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
            <Tooltip content={<ErrTooltip unit={unit} />} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
            <Scatter data={up} dataKey="Ec" fill={DIR.up} shape={<Dot />} isAnimationActive={false} />
            <Scatter data={down} dataKey="Ec" fill={DIR.down} shape={<Triangle />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {outside > 0 && <p className="mt-1.5 text-xs font-medium text-fail-600 dark:text-fail-400">{outside} point{outside > 1 ? "s" : ""} outside the MPE limit.</p>}
    </div>
  );
}
