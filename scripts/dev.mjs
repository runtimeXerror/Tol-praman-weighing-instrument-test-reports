// Starts backend (4000) and frontend (3000) together in one terminal: `npm run dev`.
// Ctrl+C stops both, including child processes (embedded MongoDB, Next.js workers).
import { spawn, spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const apps = [
  { name: "backend ", color: "\x1b[36m", cmd: "npm run dev:backend" },
  { name: "frontend", color: "\x1b[35m", cmd: "npm run dev:frontend" },
];

const children = apps.map((a) => {
  const child = spawn(a.cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "1" } });
  const prefix = `${a.color}[${a.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) out.write(prefix + l + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited (${code ?? "signal"})\n`);
    if (!stopping) stop(code ?? 1);
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  // First let the servers shut down themselves (the backend flushes the database on Ctrl+C;
  // on Windows the console already delivered Ctrl+C to them).
  if (!isWin) for (const c of children) if (c.exitCode === null) c.kill("SIGINT");
  const deadline = Date.now() + 5000;
  const wait = setInterval(() => {
    const alive = children.filter((c) => c.exitCode === null && c.pid);
    if (alive.length && Date.now() < deadline) return;
    clearInterval(wait);
    // Then force-stop whatever is left, including child processes, so no port stays busy.
    for (const c of alive) {
      if (isWin) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill("SIGKILL");
    }
    process.exit(code);
  }, 200);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
console.log("Starting TOLPRAMAN — web http://localhost:3000 · API http://localhost:4000/api  (Ctrl+C stops both)");
