"use client";

import { Cable, CircleDot, PlugZap, Unplug } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { mass } from "@/lib/format";
import { PARSERS, ScaleLink, type SerialOptions } from "@/lib/serial";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Field, Select } from "../ui/form";
import { Dialog } from "../ui/misc";

const Ctx = createContext<ScaleLink | null>(null);

export function ScaleProvider({ children }: { children: React.ReactNode }) {
  const link = useMemo(() => new ScaleLink(), []);
  useEffect(() => () => { link.disconnect(); }, [link]);
  return <Ctx.Provider value={link}>{children}</Ctx.Provider>;
}

export function useScale() {
  const link = useContext(Ctx);
  const snap = useSyncExternalStore(
    (cb) => (link ? link.subscribe(cb) : () => {}),
    () => (link ? `${link.status}|${link.last?.at ?? 0}` : "none"),
    () => "none",
  );
  void snap;
  return link;
}

/** Status bar: connect a scale (Web Serial) or start the simulator; shows the live reading. */
export function ScaleBar({ d_g }: { d_g: number }) {
  const link = useScale();
  const [open, setOpen] = useState(false);
  const [o, setO] = useState<SerialOptions>({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1, profile: "auto" });
  if (!link) return null;
  const on = link.status === "connected" || link.status === "simulating";
  const r = link.last;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2", on ? "border-navy-200 bg-navy-50/60 dark:border-navy-800 dark:bg-navy-900/30" : "border-dashed border-line")}>
      <div className="flex items-center gap-2 text-sm">
        <Cable className={cn("h-4 w-4", on ? "text-navy-600 dark:text-navy-200" : "text-muted")} />
        <span className="font-medium">Scale link</span>
        <span className="text-muted text-xs">{link.status === "simulating" ? "Simulator" : link.status === "connected" ? "Serial connected" : link.status === "error" ? link.error : "Not connected"}</span>
      </div>
      {on && (
        <div className="flex items-center gap-2 rounded-lg bg-navy-950 px-3 py-1 font-mono text-sm text-[#76ff03]">
          <CircleDot className={cn("h-3 w-3", r?.stable ? "text-[#76ff03]" : "animate-pulse text-saffron-400")} />
          {r ? mass(r.value_g) : "—"}
          <span className="text-[10px] text-navy-300">{r?.stable ? "STABLE" : "MOTION"}</span>
        </div>
      )}
      <div className="ml-auto flex gap-2">
        {on ? (
          <Button size="sm" variant="secondary" onClick={() => link.disconnect()}><Unplug className="h-3.5 w-3.5" /> Disconnect</Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><PlugZap className="h-3.5 w-3.5" /> Connect scale</Button>
            <Button size="sm" variant="ghost" onClick={() => { link.startSim(d_g); toast.info("Simulated scale started. Click the capture icon in a row."); }}>Simulator</Button>
          </>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Connect scale" subtitle="Use Chrome or Edge on a computer. Settings must match the scale indicator's output."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={async () => { try { await link.connectSerial(o); setOpen(false); toast.success("Scale connected"); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } }}>Choose port & connect</Button></>}>
        {!ScaleLink.supported() && <p className="mb-3 rounded-lg bg-cond-50 p-2 text-xs text-cond-700">This browser cannot connect to a scale. Use Chrome or Edge on a computer, or the simulator.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Baud rate"><Select value={o.baudRate} onChange={(e) => setO({ ...o, baudRate: Number(e.target.value) })}>{[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b}>{b}</option>)}</Select></Field>
          <Field label="Data bits"><Select value={o.dataBits} onChange={(e) => setO({ ...o, dataBits: Number(e.target.value) as 7 | 8 })}><option>8</option><option>7</option></Select></Field>
          <Field label="Parity"><Select value={o.parity} onChange={(e) => setO({ ...o, parity: e.target.value as SerialOptions["parity"] })}><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></Select></Field>
          <Field label="Stop bits"><Select value={o.stopBits} onChange={(e) => setO({ ...o, stopBits: Number(e.target.value) as 1 | 2 })}><option>1</option><option>2</option></Select></Field>
          <Field label="Output format" className="sm:col-span-2">
            <Select value={o.profile} onChange={(e) => setO({ ...o, profile: e.target.value })}>
              <option value="auto">Auto-detect</option>
              {PARSERS.map((p) => <option key={p.id} value={p.id}>{p.name} — e.g. {p.example}</option>)}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
