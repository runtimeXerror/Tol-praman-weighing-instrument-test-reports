import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@tolpraman/rulepacks";
import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db";
import { demoInputs } from "../src/demo";
import { ensureBuiltInPacks } from "../src/lib/packs";
import { canonicalJSON } from "../src/lib/hash";
import { Case, Reading, Report, User } from "../src/models";
import { closeBrowser } from "../src/reports/pdf";
import { seed } from "../src/seed";

const app = createApp();
const tok: Record<string, string> = {};
const ids: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

const INST = {
  type: "Electronic counter scale", model: "T-30", serialNo: "T30-1", cls: "III", max_g: 30000, min_g: 100, e_g: 5, d_g: 5,
  indication: "digital", power: "mains", electronic: true, directSale: true, liableToTilt: true, levelIndicator: true, hasTare: true,
  maxTare_g: 15000, supports: 1, tempLow_C: -10, tempHigh_C: 40,
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

beforeAll(async () => {
  await connectDb({ ephemeral: true });
  await ensureBuiltInPacks();
  await seed({ withReports: false });
  for (const [k, email, pw] of [
    ["eng", "engineer@tolpraman.demo", "Engineer@123"], ["eng2", "engineer2@tolpraman.demo", "Engineer@123"],
    ["inc", "incharge@tolpraman.demo", "Incharge@123"], ["app", "approver@tolpraman.demo", "Approver@123"], ["app2", "approver2@tolpraman.demo", "Approver@123"], ["admin", "admin@tolpraman.demo", "Admin@123"],
  ]) {
    const r = await request(app).post("/api/auth/login").send({ email, password: pw });
    expect(r.status).toBe(200);
    tok[k] = r.body.accessToken;
    ids[k] = r.body.user.id;
  }
}, 240_000);

afterAll(async () => {
  await closeBrowser();
  await disconnectDb();
});

describe("auth", () => {
  it("rejects a wrong password and missing token", async () => {
    expect((await request(app).post("/api/auth/login").send({ email: "engineer@tolpraman.demo", password: "nope" })).status).toBe(401);
    expect((await request(app).get("/api/cases")).status).toBe(401);
    expect((await request(app).get("/api/cases").set("Authorization", "Bearer garbage")).status).toBe(401);
  });
  it("the role chosen on the login form must match the account", async () => {
    const ok = await request(app).post("/api/auth/login").send({ email: "approver@tolpraman.demo", password: "Approver@123", role: "APPROVER" });
    expect(ok.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ email: "approver@tolpraman.demo", password: "Approver@123", role: "ENGINEER" });
    expect(bad.status).toBe(403);
    expect(bad.body.error).toMatch(/not a Test Engineer/);
    expect(bad.body.accessToken).toBeUndefined();
  });
  it("admin-created users must set their own password before using the system", async () => {
    await request(app).post("/api/admin/users").set(as("admin")).send({ name: "Temp User", email: "temp.user@tolpraman.demo", role: "ENGINEER", password: "Temp@1234" });
    const l = await request(app).post("/api/auth/login").send({ email: "temp.user@tolpraman.demo", password: "Temp@1234", role: "ENGINEER" });
    expect(l.body.user.mustChangePassword).toBe(true);
    const t = { Authorization: `Bearer ${l.body.accessToken}` };
    expect((await request(app).get("/api/cases").set(t)).status).toBe(403);
    expect((await request(app).post("/api/auth/password").set(t).send({ current: "Temp@1234", next: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/password").set(t).send({ current: "Temp@1234", next: "Temp@1234" })).status).toBe(400);
    const ch = await request(app).post("/api/auth/password").set(t).send({ current: "Temp@1234", next: "MyOwnPass9" });
    expect(ch.status).toBe(200);
    expect(ch.body.user.mustChangePassword).toBe(false);
    expect((await request(app).get("/api/cases").set("Authorization", `Bearer ${ch.body.accessToken}`)).status).toBe(200);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: l.body.refreshToken })).status).toBe(401);
  });
  it("refresh issues a new access token; logout invalidates the refresh token", async () => {
    const l = await request(app).post("/api/auth/login").send({ email: "engineer2@tolpraman.demo", password: "Engineer@123" });
    const r = await request(app).post("/api/auth/refresh").send({ refreshToken: l.body.refreshToken });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${r.body.accessToken}`);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: l.body.refreshToken })).status).toBe(401);
    const again = await request(app).post("/api/auth/login").send({ email: "engineer2@tolpraman.demo", password: "Engineer@123" });
    tok.eng2 = again.body.accessToken;
  });
});

describe("RBAC matrix", () => {
  it("only the Lab In-charge receives instruments and creates cases", async () => {
    const body = { title: "RBAC case", assignedEngineer: ids.eng };
    for (const who of ["eng", "admin", "app"]) expect((await request(app).post("/api/cases").set(as(who)).send(body)).status, who).toBe(403);
    const r = await request(app).post("/api/cases").set(as("inc")).send({ ...body, profile: "IN", instrument: INST, manufacturer: { name: "M" }, receipt: { sampleNo: "S-1", receivedFrom: "M" } });
    expect(r.status).toBe(201);
    ids.case = r.body.id;
    const c = await Case.findById(ids.case).lean();
    expect(c!.receipt?.sampleNo).toBe("S-1");
    expect(c!.receipt?.condition).toBe("good");
    expect(String(c!.createdBy)).toBe(ids.inc);
  });
  it("sample receipt is validated", async () => {
    const base = { title: "Receipt case", assignedEngineer: ids.eng };
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const r1 = await request(app).post("/api/cases").set(as("inc")).send({ ...base, receipt: { receivedAt: tomorrow } });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/future/);
    const r2 = await request(app).post("/api/cases").set(as("inc")).send({ ...base, receipt: { receivedAt: "2026-09-10" }, dueDate: "2026-09-01" });
    expect(r2.body.error).toMatch(/Due date cannot be before/);
    const r3 = await request(app).post("/api/cases").set(as("inc")).send({ ...base, receipt: { condition: "damaged" } });
    expect(r3.body.error).toMatch(/Describe the damage/);
    const r4 = await request(app).post("/api/cases").set(as("inc")).send({ ...base, assignedEngineer: ids.app });
    expect(r4.body.error).toMatch(/active test engineer/);
    const r5 = await request(app).post("/api/cases").set(as("inc")).send({ ...base, receipt: { condition: "damaged", notes: "Display cracked" } });
    expect(r5.status).toBe(201);
    // No profile chosen: the lab default, OIML R 76 as named in PS SIH26035
    expect((await Case.findById(r5.body.id).lean())!.profile).toBe("OIML");
  });
  it("Lab In-charge: assignment information only; never case contents, readings, reports, review or signing", async () => {
    const list = await request(app).get("/api/cases").set(as("inc"));
    expect(list.status).toBe(200);
    for (const c of list.body) for (const k of ["testInputs", "results", "verdict", "testReviews", "instrument.cls", "report"]) expect(k.includes(".") ? c.instrument?.cls : c[k], k).toBeUndefined();
    for (const path of ["", "/pack", "/readings", "/audit", "/readiness", "/chain"]) {
      expect((await request(app).get(`/api/cases/${ids.case}${path}`).set(as("inc"))).status, path || "detail").toBe(403);
    }
    const h = await request(app).get("/api/cases/assignments/history").set(as("inc"));
    expect(h.status).toBe(200);
    const mine = h.body.find((x: any) => x.id === ids.case);
    expect(mine).toMatchObject({ firstEngineer: "Ravi Kumar", engineer: "Ravi Kumar", reassignments: [] });
    expect(mine.receipt.sampleNo).toBe("S-1");
    expect(JSON.stringify(h.body)).not.toMatch(/"verdict"|"results"|"testInputs"/);
    for (const who of ["eng", "app", "admin"]) expect((await request(app).get("/api/cases/assignments/history").set(as(who))).status, who).toBe(403);
    expect((await request(app).put(`/api/cases/${ids.case}/tests/T01`).set(as("inc")).send({ input: {} })).status).toBe(403);
    expect((await request(app).put(`/api/cases/${ids.case}/instrument`).set(as("inc")).send({ instrument: { model: "x" } })).status).toBe(403);
    expect((await request(app).post(`/api/cases/${ids.case}/comments`).set(as("inc")).send({ text: "hi" })).status).toBe(403);
    for (const path of ["approve", "return", "sign", "reopen", "tests/T01/approve"]) {
      expect((await request(app).post(`/api/cases/${ids.case}/${path}`).set(as("inc")).send({})).status, path).toBe(403);
    }
    expect((await request(app).get("/api/reports").set(as("inc"))).status).toBe(403);
  });
  it("a case may be received unassigned, and assigned later", async () => {
    const before = await request(app).get("/api/dashboard/incharge").set(as("inc"));
    const unassignedBefore = before.body.kpis.unassigned;
    const r = await request(app).post("/api/cases").set(as("inc")).send({ title: "Unassigned case", instrument: INST, manufacturer: { name: "M" } });
    expect(r.status).toBe(201);
    const caseId = r.body.id;
    const c = await Case.findById(caseId).lean();
    expect(c!.assignedEngineer).toBeUndefined();
    // No engineer can claim an unassigned case; the In-charge list shows it without one.
    expect((await request(app).get(`/api/cases/${caseId}`).set(as("eng"))).status).toBe(403);
    const list = await request(app).get("/api/cases").set(as("inc"));
    expect(list.body.find((x: any) => x.id === caseId).assignedEngineer).toBeUndefined();
    const after = await request(app).get("/api/dashboard/incharge").set(as("inc"));
    expect(after.body.kpis.unassigned).toBe(unassignedBefore + 1);
    // First assignment goes through the same endpoint as reassignment, with no "from".
    const a = await request(app).put(`/api/cases/${caseId}/assign`).set(as("inc")).send({ engineer: ids.eng });
    expect(a.status).toBe(200);
    expect((await request(app).get(`/api/cases/${caseId}`).set(as("eng"))).status).toBe(200);
    const hist = (await request(app).get("/api/cases/assignments/history").set(as("inc"))).body.find((x: any) => x.id === caseId);
    expect(hist).toMatchObject({ firstEngineer: "Ravi Kumar", engineer: "Ravi Kumar", reassignments: [] });
    const done = await request(app).get("/api/dashboard/incharge").set(as("inc"));
    expect(done.body.kpis.unassigned).toBe(unassignedBefore);
  });
  it("reassignment rules (Lab In-charge only)", async () => {
    const seeded = await Case.findOne({ status: "DRAFT", _id: { $ne: ids.case }, assignedEngineer: ids.eng }).lean();
    const url = `/api/cases/${seeded!._id}/assign`;
    expect((await request(app).put(url).set(as("app")).send({ engineer: ids.eng2 })).status).toBe(403);
    expect((await request(app).put(url).set(as("inc")).send({ engineer: ids.eng })).body.error).toMatch(/already assigned/);
    expect((await request(app).put(url).set(as("inc")).send({ engineer: ids.app })).body.error).toMatch(/active test engineer/);
    expect((await request(app).put(url).set(as("inc")).send({ engineer: ids.eng2 })).body.error).toMatch(/give a reason/);
    expect((await request(app).put(url).set(as("inc")).send({ engineer: ids.eng2, reason: "Ravi on leave" })).status).toBe(200);
    expect((await request(app).get(`/api/cases/${seeded!._id}`).set(as("eng"))).status).toBe(403);
    expect((await request(app).get(`/api/cases/${seeded!._id}`).set(as("eng2"))).status).toBe(200);
    expect((await request(app).put(url).set(as("inc")).send({ engineer: ids.eng, reason: "Back from leave" })).status).toBe(200);
    const hist = (await request(app).get("/api/cases/assignments/history").set(as("inc"))).body.find((x: any) => x.id === String(seeded!._id));
    expect(hist.reassignments.map((m: any) => [m.from, m.to, m.reason])).toEqual([["Ravi Kumar", "Priya Sharma", "Ravi on leave"], ["Priya Sharma", "Ravi Kumar", "Back from leave"]]);
    const submitted = await Case.findOne({ status: { $in: ["SUBMITTED", "APPROVED"] } }).lean();
    expect((await request(app).put(`/api/cases/${submitted!._id}/assign`).set(as("inc")).send({ engineer: ids.eng2, reason: "x" })).status).toBe(409);
  });
  it("ADMIN never touches cases or reports", async () => {
    expect((await request(app).get("/api/cases").set(as("admin"))).status).toBe(403);
    expect((await request(app).get(`/api/cases/${ids.case}`).set(as("admin"))).status).toBe(403);
    expect((await request(app).get("/api/reports").set(as("admin"))).status).toBe(403);
  });
  it("engineers only see their assigned cases", async () => {
    expect((await request(app).get(`/api/cases/${ids.case}`).set(as("eng"))).status).toBe(200);
    expect((await request(app).get(`/api/cases/${ids.case}`).set(as("eng2"))).status).toBe(403);
    const list = await request(app).get("/api/cases").set(as("eng2"));
    expect(list.body.every((c: any) => c.assignedEngineer._id === ids.eng2)).toBe(true);
  });
  it("only the assigned ENGINEER enters data", async () => {
    const payload = { input: { rows: [] } };
    expect((await request(app).put(`/api/cases/${ids.case}/tests/T01`).set(as("app")).send(payload)).status).toBe(403);
    expect((await request(app).put(`/api/cases/${ids.case}/tests/T01`).set(as("eng2")).send(payload)).status).toBe(403);
    expect((await request(app).put(`/api/cases/${ids.case}/instrument`).set(as("app")).send({ instrument: { model: "x" } })).status).toBe(403);
  });
  it("admin-only endpoints", async () => {
    for (const who of ["eng", "app"]) {
      expect((await request(app).post("/api/admin/users").set(as(who)).send({ name: "X Y", email: "x@y.z", role: "ADMIN", password: "12345678" })).status).toBe(403);
      expect((await request(app).get("/api/admin/audit").set(as(who))).status).toBe(403);
      expect((await request(app).post("/api/admin/rulepacks").set(as(who)).send({})).status).toBe(403);
      expect((await request(app).put("/api/admin/lab").set(as(who)).send({ name: "Hack" })).status).toBe(403);
      expect((await request(app).post("/api/admin/weights").set(as(who)).send({})).status).toBe(403);
    }
    expect((await request(app).get("/api/admin/audit").set(as("admin"))).status).toBe(200);
  });
  it("Lab In-charge user list is limited to active engineers; senior engineers no longer assign", async () => {
    expect((await request(app).get("/api/admin/users").set(as("app"))).status).toBe(403);
    const r = await request(app).get("/api/admin/users").set(as("inc"));
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((u: any) => u.role === "ENGINEER" && !u.passwordHash)).toBe(true);
  });
  it("dashboards by role", async () => {
    expect((await request(app).get("/api/dashboard/lab").set(as("app"))).status).toBe(200);
    expect((await request(app).get("/api/dashboard/lab").set(as("eng"))).status).toBe(403);
    expect((await request(app).get("/api/dashboard/me").set(as("eng"))).status).toBe(200);
    expect((await request(app).get("/api/dashboard/admin").set(as("admin"))).status).toBe(200);
    const d = await request(app).get("/api/dashboard/incharge").set(as("inc"));
    expect(d.status).toBe(200);
    expect(d.body.workload.length).toBeGreaterThan(0);
    expect(d.body.workload[0]).toHaveProperty("testsLeft");
    expect((await request(app).get("/api/dashboard/incharge").set(as("app"))).status).toBe(403);
  });
});

describe("engine on the server", () => {
  it("never trusts client verdicts", async () => {
    const r = await request(app).put(`/api/cases/${ids.case}/tests/T13`).set(as("eng")).send({
      input: { rows: [{ disturbance: "ESD", L: 10000, I_without: 10000, I_with: 10050, verdict: "PASS", Ec: 0 }] },
    });
    expect(r.status).toBe(200);
    expect(r.body.result.verdict).toBe("FAIL");
    expect(r.body.result.rows[0].fault).toBe(50);
  });
  it("flags time-implausible creep data", async () => {
    const rows = [0, 15, 30, 240].map((t) => ({ t_min: t, I: 29990, dL: 2 }));
    const r = await request(app).put(`/api/cases/${ids.case}/tests/T07b`).set(as("eng")).send({ input: { L: 29990, rows } });
    expect(r.body.plausibilityFlags.some((f: any) => f.testId === "T07b")).toBe(true);
  });
  it("case is locked to the rule pack it was created with", async () => {
    const r = await request(app).get(`/api/cases/${ids.case}/pack`).set(as("eng"));
    expect(r.body.hash).toBe(loadPack("IN").packHash);
  });
});

describe("status machine, chain, maker-checker, sign, verify", () => {
  it("submit is blocked until complete", async () => {
    const r = await request(app).post(`/api/cases/${ids.case}/submit`).set(as("eng"));
    expect(r.status).toBe(400);
    expect(r.body.details.join(" ")).toMatch(/Tests incomplete/);
  });

  it("engineer completes all tests, environment and attachments", async () => {
    const pack = loadPack("IN").pack;
    const inputs = demoInputs(INST as any, pack, 7);
    for (const [testId, input] of Object.entries(inputs)) {
      const r = await request(app).put(`/api/cases/${ids.case}/tests/${testId}`).set(as("eng")).send({ input });
      expect(r.status, testId).toBe(200);
    }
    // plausibility would flag instantly-entered time tests; that is a warning, not a blocker
    expect((await request(app).post(`/api/cases/${ids.case}/sessions`).set(as("eng")).send({ T_C: 21.5, RH_pct: 50, p_hPa: 1010 })).status).toBe(201);
    for (const category of ["INSTRUMENT_PHOTO", "NAMEPLATE"]) {
      const r = await request(app).post(`/api/cases/${ids.case}/attachments`).set(as("eng")).field("category", category).attach("file", PNG, { filename: "p.png", contentType: "image/png" });
      expect(r.status).toBe(201);
      expect(r.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const rd = await request(app).get(`/api/cases/${ids.case}/readiness`).set(as("eng"));
    expect(rd.body.blockers).toEqual([]);
  });

  it("expired weights/equipment are blocked in sessions", async () => {
    const w = await request(app).get("/api/admin/weights").set(as("eng"));
    const expired = w.body.find((x: any) => x.expired);
    const r = await request(app).post(`/api/cases/${ids.case}/sessions`).set(as("eng")).send({ T_C: 21, RH_pct: 50, weightsUsed: [expired.id] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Calibration expired/);
  });

  it("wrong transitions are refused", async () => {
    expect((await request(app).post(`/api/cases/${ids.case}/approve`).set(as("app"))).status).toBe(409);
    expect((await request(app).post(`/api/cases/${ids.case}/sign`).set(as("app"))).status).toBe(409);
    expect((await request(app).post(`/api/cases/${ids.case}/submit`).set(as("app"))).status).toBe(403);
  });

  const reviews = async () => (await request(app).get(`/api/cases/${ids.case}`).set(as("app"))).body.reviews as any[];

  it("submit -> per-test review: approve passing, FAIL/CONDITIONAL need a note, case approval waits for every test", async () => {
    expect((await request(app).post(`/api/cases/${ids.case}/submit`).set(as("eng"))).status).toBe(200);
    expect((await request(app).put(`/api/cases/${ids.case}/tests/T01`).set(as("eng")).send({ input: {} })).status).toBe(409);
    expect((await request(app).post(`/api/cases/${ids.case}/approve`).set(as("eng"))).status).toBe(403);
    expect((await request(app).post(`/api/cases/${ids.case}/tests/T01/approve`).set(as("eng"))).status).toBe(403);
    const before = await reviews();
    expect(before.length).toBeGreaterThan(5);
    expect(before.every((r) => r.state === "PENDING")).toBe(true);
    const bulk = await request(app).post(`/api/cases/${ids.case}/tests/approve-passing`).set(as("app"));
    expect(bulk.status).toBe(200);
    const after = bulk.body.reviews as any[];
    for (const r of after) expect(r.state).toBe(r.current === "PASS" ? "APPROVED" : "PENDING");
    const notPass = after.find((r) => r.current === "FAIL" || r.current === "CONDITIONAL");
    if (notPass) {
      const r = await request(app).post(`/api/cases/${ids.case}/tests/${notPass.testId}/approve`).set(as("app")).send({});
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/note confirming/);
    }
    // undo one approval: the case cannot be approved while any test is not approved
    const one = after.find((r) => r.state === "APPROVED")!;
    const un = await request(app).post(`/api/cases/${ids.case}/tests/${one.testId}/unapprove`).set(as("app"));
    expect(un.body.reviews.find((r: any) => r.testId === one.testId).state).toBe("PENDING");
    const ap = await request(app).post(`/api/cases/${ids.case}/approve`).set(as("app"));
    expect(ap.status).toBe(409);
    expect(ap.body.error).toMatch(/Approve every test first.*/);
    expect(ap.body.details.pending).toContain(one.testId);
    expect((await request(app).post(`/api/cases/${ids.case}/tests/T99/approve`).set(as("app"))).status).toBe(400);
    expect((await request(app).post(`/api/cases/${ids.case}/tests/${one.testId}/approve`).set(as("app"))).status).toBe(200);
  });

  it("return: only the tests sent back can be changed; approved tests are locked", async () => {
    expect((await request(app).post(`/api/cases/${ids.case}/return`).set(as("app")).send({})).status).toBe(400);
    expect((await request(app).post(`/api/cases/${ids.case}/return`).set(as("app")).send({ testComments: [{ testId: "T13", text: "x" }] })).status).toBe(400);
    expect((await request(app).post(`/api/cases/${ids.case}/return`).set(as("app")).send({ testComments: [{ testId: "T13", text: "Repeat ESD" }, { testId: "T13", text: "Again" }] })).body.error).toMatch(/twice/);
    const ret = await request(app).post(`/api/cases/${ids.case}/return`).set(as("app")).send({ comment: "Please re-check T13 ESD", testComments: [{ testId: "T13", text: "Repeat ESD" }] });
    expect(ret.status).toBe(200);
    const v = await reviews();
    expect(v.find((r) => r.testId === "T13").state).toBe("RETURNED");
    const locked = v.find((r) => r.state === "APPROVED" && r.testId !== "T13");
    const lr = await request(app).put(`/api/cases/${ids.case}/tests/${locked.testId}`).set(as("eng")).send({ input: {} });
    expect(lr.status).toBe(409);
    expect(lr.body.error).toMatch(/approved by .* and is locked/);
  });

  it("resubmitting a returned test with no new readings needs confirmation", async () => {
    const r = await request(app).post(`/api/cases/${ids.case}/submit`).set(as("eng")).send({});
    expect(r.status).toBe(409);
    expect(r.body.details.unchanged).toEqual(["T13"]);
  });

  it("changing the instrument profile cancels approvals (MPE may change)", async () => {
    const approvedBefore = (await reviews()).filter((r) => r.state === "APPROVED").length;
    expect(approvedBefore).toBeGreaterThan(0);
    const r = await request(app).put(`/api/cases/${ids.case}/instrument`).set(as("eng")).send({ instrument: { maxTare_g: 14000 } });
    expect(r.body.approvalsCleared).toBe(approvedBefore);
    expect((await reviews()).filter((x) => x.state === "APPROVED").length).toBe(0);
    expect((await reviews()).some((x) => x.stale)).toBe(true);
    // identification-only changes keep approvals
    await request(app).put(`/api/cases/${ids.case}/instrument`).set(as("eng")).send({ instrument: { maxTare_g: 15000 } });
    const restored = (await reviews()).filter((x) => x.state === "APPROVED").length;
    expect(restored).toBe(approvedBefore);
    const id = await request(app).put(`/api/cases/${ids.case}/instrument`).set(as("eng")).send({ instrument: { serialNo: "T30-1B" } });
    expect(id.body.approvalsCleared).toBe(0);
  });

  it("fixed test goes back to the senior engineer; approved tests stay approved", async () => {
    const fix = await request(app).put(`/api/cases/${ids.case}/tests/T13`).set(as("eng")).send({ input: { rows: [{ disturbance: "ESD", L: 10000, I_without: 10000, I_with: 10000 }] } });
    expect(fix.body.result.verdict).toBe("PASS");
    expect((await request(app).post(`/api/cases/${ids.case}/submit`).set(as("eng"))).status).toBe(200);
    const v = await reviews();
    expect(v.find((r) => r.testId === "T13").state).toBe("PENDING");
    expect(v.filter((r) => r.state === "APPROVED").length).toBeGreaterThan(0);
  });

  it("maker-checker: a user who entered readings cannot approve", async () => {
    const c = await Case.findById(ids.case);
    const last = await Reading.findOne({ case: c!._id }).sort({ seq: -1 }).lean();
    // simulate the approver having entered data: an extra (valid) chain entry by the approver
    const { chainHash } = await import("../src/lib/hash");
    const rec = { case: String(c!._id), seq: last!.seq + 1, testId: "NOTE", values: { x: 1 }, source: "MANUAL", capturedAt: new Date().toISOString(), user: ids.app2 };
    await Reading.create({ ...rec, capturedAt: new Date(rec.capturedAt), prevHash: last!.hash, hash: chainHash(rec, last!.hash) });
    expect((await request(app).post(`/api/cases/${ids.case}/approve`).set(as("app2"))).status).toBe(403);
  });

  it("reading chain verifies, and detects tampering", async () => {
    expect((await request(app).get(`/api/cases/${ids.case}/chain`).set(as("app"))).body.ok).toBe(true);
    const r = await Reading.findOne({ case: ids.case, testId: "T13" }).sort({ seq: -1 });
    const orig = r!.values;
    await Reading.updateOne({ _id: r!._id }, { $set: { values: { rows: [{ I_with: 99999 }] } } });
    const bad = await request(app).get(`/api/cases/${ids.case}/chain`).set(as("app"));
    expect(bad.body.ok).toBe(false);
    await Reading.updateOne({ _id: r!._id }, { $set: { values: orig } });
    expect((await request(app).get(`/api/cases/${ids.case}/chain`).set(as("app"))).body.ok).toBe(true);
  });

  it("draft cases never get a verifyId", async () => {
    const draft = await Case.findOne({ status: "DRAFT", _id: { $ne: ids.case } }).lean();
    expect(draft!.report).toBeFalsy();
    expect((await request(app).get("/api/verify/draft")).status).toBe(404);
  });

  it("approve -> sign -> locked", async () => {
    for (const r of await reviews()) {
      if (r.state === "APPROVED") continue;
      const a = await request(app).post(`/api/cases/${ids.case}/tests/${r.testId}/approve`).set(as("app")).send({ note: "Checked against the rule pack" });
      expect(a.status, `${r.testId} ${JSON.stringify(a.body)}`).toBe(200);
    }
    const ap = await request(app).post(`/api/cases/${ids.case}/approve`).set(as("app"));
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    const s = await request(app).post(`/api/cases/${ids.case}/sign`).set(as("app"));
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.verifyId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    ids.report = s.body.reportId;
    ids.verify = s.body.verifyId;
    const c = await request(app).get(`/api/cases/${ids.case}`).set(as("eng"));
    expect(c.body.status).toBe("SIGNED");
    expect(c.body.locked).toBe(true);
    expect((await request(app).put(`/api/cases/${ids.case}/tests/T01`).set(as("eng")).send({ input: {} })).status).toBe(409);
  }, 120_000);

  it("report repository: search by serial number; instrument-wise history by model and manufacturer", async () => {
    const bySerial = await request(app).get("/api/reports?q=T30-1").set(as("app"));
    expect(bySerial.body.map((x: any) => x.id)).toContain(ids.report);
    const history = await request(app).get("/api/reports?model=t-30&manufacturer=M").set(as("app"));
    expect(history.body.map((x: any) => x.id)).toContain(ids.report);
    expect(history.body.every((x: any) => x.summary.model === "T-30")).toBe(true);
    // exact model match: "T-3" is a different model
    expect((await request(app).get("/api/reports?model=T-3").set(as("app"))).body).toHaveLength(0);
  });

  it("public verify: summary only, detects an edited PDF, shows REVOKED", async () => {
    const v = await request(app).get(`/api/verify/${ids.verify}`);
    expect(v.status).toBe(200);
    expect(v.body.status).toBe("VALID");
    const text = JSON.stringify(v.body);
    const people = await User.find().lean();
    for (const p of people) expect(text).not.toContain(p.name);
    expect(text).not.toMatch(/"rows"|"readings"|"testInputs"|"I_with"/);

    const pdf = await request(app).get(`/api/reports/${ids.report}/pdf`).set(as("app")).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on("data", (d: Buffer) => b.push(d)); res.on("end", () => cb(null, Buffer.concat(b))); });
    expect(pdf.status).toBe(200);
    const bytes = pdf.body as Buffer;
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const ok = await request(app).post(`/api/verify/${ids.verify}/file`).attach("file", bytes, { filename: "r.pdf", contentType: "application/pdf" });
    expect(ok.body.result).toBe("AUTHENTIC");
    const edited = Buffer.concat([bytes, Buffer.from("\n% edited")]);
    const mod = await request(app).post(`/api/verify/${ids.verify}/file`).attach("file", edited, { filename: "r.pdf", contentType: "application/pdf" });
    expect(mod.body.result).toBe("MODIFIED");

    const docx = await request(app).get(`/api/reports/${ids.report}/docx`).set(as("eng"));
    expect(docx.status).toBe(200);

    expect((await request(app).post(`/api/reports/${ids.report}/revoke`).set(as("eng")).send({ reason: "Wrong model number" })).status).toBe(403);
    expect((await request(app).post(`/api/reports/${ids.report}/revoke`).set(as("app")).send({ reason: "Wrong model number" })).status).toBe(200);
    expect((await request(app).get(`/api/verify/${ids.verify}`)).body.status).toBe("REVOKED");
  }, 60_000);

  it("signed case reopened for re-test -> revised report supersedes the old one", async () => {
    const c = await Case.findOne({ status: "APPROVED" });
    const s1 = await request(app).post(`/api/cases/${c!._id}/sign`).set(as("app"));
    expect(s1.status, JSON.stringify(s1.body)).toBe(200);
    const url = `/api/cases/${c!._id}/reopen`;
    const t = (await request(app).get(`/api/cases/${c!._id}`).set(as("app"))).body.reviews[0].testId;
    expect((await request(app).post(url).set(as("eng")).send({ reason: "Customer complaint about zero drift", testComments: [{ testId: t, text: "Repeat" }] })).status).toBe(403);
    expect((await request(app).post(url).set(as("app")).send({ reason: "short", testComments: [{ testId: t, text: "Repeat" }] })).status).toBe(400);
    expect((await request(app).post(url).set(as("app")).send({ reason: "Customer complaint about zero drift", testComments: [] })).status).toBe(400);
    const re = await request(app).post(url).set(as("app")).send({ reason: "Customer complaint about zero drift", testComments: [{ testId: t, text: "Repeat this test" }] });
    expect(re.status, JSON.stringify(re.body)).toBe(200);
    expect(re.body.revision).toBe(1);
    // old report still valid, but marked under revision
    const old = await request(app).get(`/api/verify/${s1.body.verifyId}`);
    expect(old.body.status).toBe("VALID");
    expect(old.body.underRevision).toBe(true);
    // only the reopened test is editable; others keep the approval from the signed report
    const view = (await request(app).get(`/api/cases/${c!._id}`).set(as("app"))).body.reviews as any[];
    expect(view.filter((r) => r.state === "RETURNED").map((r) => r.testId)).toEqual([t]);
    expect(view.filter((r) => r.state === "APPROVED").length).toBe(view.length - 1);
    // the seeded engineer re-tests, resubmits (confirming unchanged here), senior approves and signs again
    const eng = (await User.findById(c!.assignedEngineer).lean())!;
    const login = await request(app).post("/api/auth/login").send({ email: eng.email, password: "Engineer@123" });
    const E = { Authorization: `Bearer ${login.body.accessToken}` };
    for (const category of ["INSTRUMENT_PHOTO", "NAMEPLATE"]) {
      await request(app).post(`/api/cases/${c!._id}/attachments`).set(E).field("category", category).attach("file", PNG, { filename: "p.png", contentType: "image/png" });
    }
    const unconfirmed = await request(app).post(`/api/cases/${c!._id}/submit`).set(E).send({});
    expect(unconfirmed.status, JSON.stringify(unconfirmed.body)).toBe(409);
    expect((await request(app).post(`/api/cases/${c!._id}/submit`).set(E).send({ confirmUnchanged: true })).status).toBe(200);
    expect((await request(app).post(`/api/cases/${c!._id}/tests/${t}/approve`).set(as("app")).send({ note: "Re-checked" })).status).toBe(200);
    expect((await request(app).post(`/api/cases/${c!._id}/approve`).set(as("app"))).status).toBe(200);
    const s2 = await request(app).post(`/api/cases/${c!._id}/sign`).set(as("app"));
    expect(s2.status).toBe(200);
    expect(s2.body.revision).toBe(1);
    expect(s2.body.supersedes).toBe(s1.body.reportNo);
    const oldNow = await request(app).get(`/api/verify/${s1.body.verifyId}`);
    expect(oldNow.body.status).toBe("SUPERSEDED");
    expect(oldNow.body.supersededBy.reportNo).toBe(s2.body.reportNo);
    expect(oldNow.body.underRevision).toBeUndefined();
    const nu = await request(app).get(`/api/verify/${s2.body.verifyId}`);
    expect(nu.body).toMatchObject({ status: "VALID", revision: 1, supersedes: s1.body.reportNo });
    expect(await Report.countDocuments({ case: c!._id })).toBe(2);
  }, 120_000);

  it("Ed25519 lab signature: valid, checkable offline with the public key, broken by any change", async () => {
    const v = await request(app).get(`/api/verify/${ids.verify}`);
    expect(v.body.signature).toMatchObject({ algorithm: "Ed25519", valid: true });
    const key = await request(app).get("/api/verify/public-key");
    expect(key.body.keyId).toBe(v.body.signature.keyId);
    const bundle = (await request(app).get(`/api/verify/${ids.verify}/signature`)).body;
    expect(bundle.statement).toMatchObject({ reportNo: v.body.reportNo, pdfSha256: v.body.sha256, keyId: key.body.keyId });
    // offline check, using only the bundle
    const pub = crypto.createPublicKey(bundle.publicKeyPem);
    const sig = Buffer.from(bundle.signature, "base64");
    expect(crypto.verify(null, Buffer.from(canonicalJSON(bundle.statement)), pub, sig)).toBe(true);
    expect(crypto.verify(null, Buffer.from(canonicalJSON({ ...bundle.statement, pdfSha256: "0".repeat(64) })), pub, sig)).toBe(false);
    // tampering with the stored hash makes the server report the signature as invalid
    const r = await Report.findOne({ verifyId: ids.verify });
    const orig = r!.sha256;
    await Report.updateOne({ _id: r!._id }, { sha256: "f".repeat(64) });
    expect((await request(app).get(`/api/verify/${ids.verify}`)).body.signature.valid).toBe(false);
    await Report.updateOne({ _id: r!._id }, { sha256: orig });
    expect((await request(app).get("/api/verify/nope/signature")).status).toBe(404);
  });
});

describe("rule packs and audit", () => {
  it("upload validates against the schema, activation and impact simulation", async () => {
    expect((await request(app).post("/api/admin/rulepacks").set(as("admin")).send({ id: "bad" })).status).toBe(400);
    const raw = structuredClone((await import("@tolpraman/rulepacks")).rawPacks.IN) as any;
    raw.version = "2026.09.99-test";
    raw.overrides.general_limits.zero_return_e = { value: 0.25, clause: "TEST" };
    const up = await request(app).post("/api/admin/rulepacks").set(as("admin")).send(raw);
    expect(up.status).toBe(201);
    const imp = await request(app).post(`/api/admin/rulepacks/${up.body.id}/impact`).set(as("admin"));
    expect(imp.status).toBe(200);
    expect(imp.body.total).toBeGreaterThanOrEqual(1);
    const before = await Case.findById(ids.case).lean();
    expect(before!.status).toBe("SIGNED");
  });
  it("audit chain verifies", async () => {
    const r = await request(app).get("/api/admin/audit/verify").set(as("admin"));
    expect(r.body.ok).toBe(true);
    expect(r.body.count).toBeGreaterThan(10);
  });
});
