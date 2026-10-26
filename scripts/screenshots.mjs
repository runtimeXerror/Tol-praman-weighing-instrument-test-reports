// Captures the README screenshots into docs/screenshots/.
// Needs the app running with demo data:  npm run seed -- --reset  &&  npm run dev
// Then:  node scripts/screenshots.mjs   (BASE_URL defaults to http://localhost:3000)
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const puppeteer = createRequire(path.join(root, "backend", "package.json"))("puppeteer");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(root, "docs", "screenshots");

const USERS = {
  INCHARGE: ["incharge@tolpraman.demo", "Incharge@123"],
  ENGINEER: ["engineer@tolpraman.demo", "Engineer@123"],
  APPROVER: ["approver@tolpraman.demo", "Approver@123"],
  ADMIN: ["admin@tolpraman.demo", "Admin@123"],
};

const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

async function shot(page, url, name, fullPage = false) {
  await page.goto(BASE + url, { waitUntil: "networkidle0", timeout: 60_000 });
  await settle();
  // Keep event badges out of the README images.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("span")) if (/\bSIH\b/.test(el.textContent ?? "") && el.children.length <= 1) el.remove();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode()); ) n.nodeValue = n.nodeValue.replace(/\s*\(as in the problem statement\)/, "");
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log("saved", name);
}

async function login(page, role) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  const err = await page.evaluate(async (email, password, role) => {
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, role }) });
    if (!r.ok) return `${r.status} ${await r.text()}`;
    localStorage.setItem("tp-auth", JSON.stringify(await r.json()));
    return null;
  }, ...USERS[role], role);
  if (err) throw new Error(`login ${role} failed: ${err}`);
}

/** GET /api<p> with the logged-in user's token. */
const apiGet = (page, p) =>
  page.evaluate(async (p) => {
    const s = JSON.parse(localStorage.getItem("tp-auth"));
    const r = await fetch(`/api${p}`, { headers: { Authorization: `Bearer ${s.accessToken}` } });
    return r.json();
  }, p);

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();

try {
  await shot(page, "/login", "01-login");

  await login(page, "INCHARGE");
  await shot(page, "/incharge", "02-incharge-dashboard");
  await shot(page, "/incharge/new", "03-incharge-receive");

  await login(page, "ENGINEER");
  await shot(page, "/engineer", "04-engineer-cases");
  const [demo] = await apiGet(page, "/cases?q=XYZ-30");
  if (demo) await shot(page, `/engineer/cases/${demo.id}`, "05-engineer-test-entry", true);

  await login(page, "APPROVER");
  await shot(page, "/approver", "06-approver-dashboard");
  await shot(page, "/approver/queue", "07-approver-review-queue");
  const submitted = await apiGet(page, "/cases?status=SUBMITTED");
  if (submitted[0]) await shot(page, `/approver/cases/${submitted[0].id}`, "08-approver-review", true);
  await shot(page, "/reports", "09-search-reports");
  const reports = await apiGet(page, "/reports");

  await login(page, "ADMIN");
  await shot(page, "/admin/users", "10-admin-users");
  await shot(page, "/admin/rulepacks", "11-admin-rulepacks");

  const signed = reports.find((r) => !r.revoked);
  if (signed) {
    await page.evaluate(() => localStorage.clear());
    await shot(page, `/verify/${signed.verifyId}`, "12-public-verify");
  }
} finally {
  await browser.close();
}
