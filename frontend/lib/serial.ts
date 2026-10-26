"use client";

/**
 * Scale link. Reads weight lines from a scale over the Web Serial API (Chrome / Edge desktop),
 * or from a built-in simulator for demos without hardware. Values are normalised to grams.
 */

export interface ScaleReading {
  stable: boolean;
  value_g: number;
  unit: string;
  raw: string;
  at: number;
}

export interface ParserProfile {
  id: string;
  name: string;
  example: string;
  parse: (line: string) => Omit<ScaleReading, "at" | "raw"> | null;
}

const toG = (v: number, u: string) => {
  const k = u.toLowerCase();
  return k === "kg" ? v * 1000 : k === "mg" ? v / 1000 : k === "t" ? v * 1e6 : v;
};
const num = (s: string) => Number(s.replace(/\s+/g, ""));

/** Parser profiles for common indicator output formats. */
export const PARSERS: ParserProfile[] = [
  {
    id: "st-gs",
    name: "Generic indicator (ST/US,GS,…)",
    example: "ST,GS,+  10.005kg",
    parse: (l) => {
      const m = l.match(/^\s*(ST|US|OL)\s*,\s*(GS|NT|TR|G|N)?\s*,?\s*([+-]?\s*[\d.]+)\s*(kg|g|mg|t)\s*$/i);
      if (!m || m[1].toUpperCase() === "OL") return null;
      return { stable: m[1].toUpperCase() === "ST", value_g: toG(num(m[3]), m[4]), unit: m[4] };
    },
  },
  {
    id: "mt-sics",
    name: "Mettler Toledo MT-SICS (S S / S D)",
    example: "S S     10.0050 kg",
    parse: (l) => {
      const m = l.match(/^\s*S\s+([SD])\s+([+-]?[\d.]+)\s+(kg|g|mg)\s*$/);
      return m ? { stable: m[1] === "S", value_g: toG(Number(m[2]), m[3]), unit: m[3] } : null;
    },
  },
  {
    id: "sartorius",
    name: "Sartorius SBI (unit shown when stable)",
    example: "+     10.005 kg",
    parse: (l) => {
      const m = l.match(/^\s*([+-])\s*([\d.]+)\s*(kg|g|mg)?\s*$/);
      if (!m) return null;
      const v = Number(m[2]) * (m[1] === "-" ? -1 : 1);
      return { stable: !!m[3], value_g: toG(v, m[3] ?? "g"), unit: m[3] ?? "g" };
    },
  },
  {
    id: "json",
    name: "JSON (Arduino + HX711 demo rig)",
    example: '{"w":10.005,"u":"kg","s":1}',
    parse: (l) => {
      try {
        const j = JSON.parse(l);
        if (typeof j.w !== "number") return null;
        return { stable: !!j.s, value_g: toG(j.w, j.u ?? "g"), unit: j.u ?? "g" };
      } catch {
        return null;
      }
    },
  },
];

export function parseLine(line: string, profileId?: string): Omit<ScaleReading, "at" | "raw"> | null {
  const list = profileId ? PARSERS.filter((p) => p.id === profileId) : PARSERS;
  for (const p of list) {
    const r = p.parse(line);
    if (r && Number.isFinite(r.value_g)) return r;
  }
  return null;
}

export type ScaleStatus = "disconnected" | "connecting" | "connected" | "simulating" | "error";

export interface SerialOptions {
  baudRate: number;
  dataBits: 7 | 8;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 2;
  profile: string;
}

export class ScaleLink {
  status: ScaleStatus = "disconnected";
  last: ScaleReading | null = null;
  error: string | null = null;
  private listeners = new Set<() => void>();
  private port: any = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private simTarget = 0;
  private simSince = 0;
  private simD = 1;

  static supported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  async connectSerial(o: SerialOptions) {
    if (!ScaleLink.supported()) throw new Error("Web Serial is available in Chrome or Edge on desktop.");
    this.stopSim();
    this.status = "connecting";
    this.emit();
    try {
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate: o.baudRate, dataBits: o.dataBits, parity: o.parity, stopBits: o.stopBits });
      this.status = "connected";
      this.error = null;
      this.emit();
      const decoder = new TextDecoderStream();
      this.port.readable.pipeTo(decoder.writable).catch(() => {});
      this.reader = decoder.readable.getReader();
      let buf = "";
      (async () => {
        try {
          for (;;) {
            const { value, done } = await this.reader!.read();
            if (done) break;
            buf += value;
            const lines = buf.split(/\r?\n|\r/);
            buf = lines.pop() ?? "";
            for (const raw of lines) {
              const r = parseLine(raw, o.profile === "auto" ? undefined : o.profile);
              if (r) { this.last = { ...r, raw, at: Date.now() }; this.emit(); }
            }
          }
        } catch (e) {
          this.status = "error";
          this.error = e instanceof Error ? e.message : String(e);
          this.emit();
        }
      })();
    } catch (e) {
      this.status = "error";
      this.error = e instanceof Error ? e.message : String(e);
      this.emit();
      throw e;
    }
  }

  /** Simulated scale: settles on the target within ~1.5 s, like a real load cell. */
  startSim(d_g: number) {
    this.stopSim();
    this.simD = d_g || 1;
    this.status = "simulating";
    this.simSince = Date.now();
    this.simTimer = setInterval(() => {
      const t = (Date.now() - this.simSince) / 1000;
      const settle = Math.max(0, 1 - t / 1.4);
      const noise = (Math.random() - 0.5) * this.simD * 8 * settle;
      const stable = t > 1.4;
      const v = Math.round((this.simTarget + noise) / this.simD) * this.simD;
      const kg = this.simTarget >= 1000;
      const shown = kg ? (v / 1000).toFixed(Math.max(0, Math.ceil(-Math.log10(this.simD / 1000)))) : v.toFixed(Math.max(0, Math.ceil(-Math.log10(this.simD))));
      const raw = `${stable ? "ST" : "US"},GS,+${shown.padStart(9)}${kg ? "kg" : "g"}`;
      const r = parseLine(raw, "st-gs");
      if (r) { this.last = { ...r, raw, at: Date.now() }; this.emit(); }
    }, 180);
    this.emit();
  }

  /** Put a new load on the simulated scale (true value = load + a small instrument error). */
  simLoad(load_g: number, e_g: number) {
    this.simTarget = load_g + (Math.random() - 0.5) * e_g * 0.8;
    this.simSince = Date.now();
  }

  private stopSim() {
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = null;
  }

  async disconnect() {
    this.stopSim();
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { await this.port?.close(); } catch { /* ignore */ }
    this.reader = null;
    this.port = null;
    this.status = "disconnected";
    this.last = null;
    this.emit();
  }
}
