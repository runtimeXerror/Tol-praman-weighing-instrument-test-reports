import fs from "node:fs";
import path from "node:path";
import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { validateInstrument } from "@tolpraman/engine";
import { requireAuth, requireRole } from "../auth";
import { config } from "../config";
import { audit } from "../lib/audit";
import { appendReading, applicable, nextCaseNo, recompute, toProfile, verifyChain } from "../lib/compute";
import { sha256 } from "../lib/hash";
import { ah, bad, conflict, forbidden, notFound, parse } from "../lib/http";
import { activePack, packById } from "../lib/packs";
import { approvalFor, hashInput, notApproved, reviewView, setReview, storedReviews } from "../lib/review";
import { Attachment, AuditLog, Case, Comment, Lab, Reading, Report, TestSession, User } from "../models";

export const casesRouter = Router();
casesRouter.use(requireAuth);

const ENGINEER = requireRole("ENGINEER");
const APPROVER = requireRole("APPROVER");
const INCHARGE = requireRole("INCHARGE");
const CASE_USERS = requireRole("ENGINEER", "APPROVER");
/** The case list; the Lab In-charge gets only receipt and assignment fields (never readings, results or reports). */
const VIEWERS = requireRole("ENGINEER", "APPROVER", "INCHARGE");
const INCHARGE_FIELDS = "caseNo title applicationNo profile status assignedEngineer createdBy manufacturer.name instrument.type instrument.model instrument.max_g receipt dueDate priority counts createdAt updatedAt submittedAt signedAt revision";

export const EDITABLE = ["DRAFT", "RETURNED"];
export const ATTACHMENT_CATEGORIES = [
  { id: "INSTRUMENT_PHOTO", label: "Instrument photograph", required: true },
  { id: "NAMEPLATE", label: "Nameplate / descriptive markings", required: true },
  { id: "SEALING", label: "Sealing / securing provisions", required: false },
  { id: "TEST_SETUP", label: "Test set-up photograph", required: false },
  { id: "MANUAL", label: "Operating manual / documentation", required: false },
  { id: "CERTIFICATE", label: "Component certificates (load cell, indicator)", required: false },
  { id: "OTHER", label: "Other", required: false },
] as const;

/**
 * Load a case the current user may see. ENGINEER: only assigned cases. APPROVER: all cases.
 * INCHARGE sees assignment information only (list + history), never the case contents.
 * ADMIN never touches cases or reports.
 */
export async function caseFor(req: Request, id: string, opts: { edit?: boolean } = {}) {
  const c = await Case.findById(id);
  if (!c) throw notFound("Case");
  const u = req.user!;
  if (u.role === "ADMIN") throw forbidden("Administrators do not access test cases");
  if (u.role === "ENGINEER" && String(c.assignedEngineer) !== u.id) throw forbidden("This case is not assigned to you");
  if (opts.edit) {
    if (u.role !== "ENGINEER") throw forbidden("Only the assigned engineer can enter data");
    if (c.locked || !EDITABLE.includes(c.status)) throw conflict(`Case is ${c.status}; data entry is closed`);
  }
  return c;
}

/** After the senior engineer has reviewed, only tests that were not approved may be changed. */
async function assertTestEditable(c: any, testId: string) {
  if (c.status !== "RETURNED") return;
  const pack = await packById(String(c.rulepack));
  const r = reviewView(c, pack).find((x) => x.testId === testId);
  if (r?.state === "APPROVED") throw conflict(`${testId} was approved by ${r.byName ?? "the senior engineer"} and is locked. Ask the senior engineer to send it back if it must be re-tested.`);
}

/** Users who entered data for a case (makers). They can never approve or sign it. */
export async function makersOf(caseId: unknown, assigned: unknown): Promise<Set<string>> {
  const ids = await Reading.distinct("user", { case: caseId });
  return new Set([...ids.map(String), String(assigned)]);
}

const listQuery = z.object({
  status: z.string().optional(), verdict: z.string().optional(), q: z.string().optional(), profile: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(), engineer: z.string().optional(), limit: z.coerce.number().optional(),
});

casesRouter.get("/", VIEWERS, ah(async (req, res) => {
  const f = parse(listQuery, req.query);
  const q: any = {};
  if (req.user!.role === "ENGINEER") q.assignedEngineer = req.user!.id;
  else if (f.engineer) q.assignedEngineer = f.engineer;
  if (f.status) q.status = { $in: f.status.split(",") };
  if (f.verdict) q.verdict = { $in: f.verdict.split(",") };
  if (f.profile) q.profile = f.profile;
  if (f.from || f.to) q.createdAt = { ...(f.from ? { $gte: new Date(f.from) } : {}), ...(f.to ? { $lte: new Date(f.to + "T23:59:59") } : {}) };
  if (f.q) {
    const rx = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ caseNo: rx }, { applicationNo: rx }, { title: rx }, { "instrument.model": rx }, { "instrument.type": rx }, { "manufacturer.name": rx }, { "instrument.serialNo": rx }];
  }
  if (req.user!.role === "INCHARGE") {
    const rows = await Case.find(q).select(INCHARGE_FIELDS).populate("assignedEngineer", "name").populate("createdBy", "name").sort({ updatedAt: -1 }).limit(1000).lean();
    return res.json(rows.map((c) => ({ ...c, id: String(c._id) })));
  }
  const items = await Case.find(q)
    .select("-testInputs -results")
    .populate("assignedEngineer", "name email")
    .populate("createdBy", "name")
    .populate("report", "reportNo verifyId revoked signedAt revision underRevision")
    .sort({ updatedAt: -1 })
    .limit(Math.min(f.limit ?? 500, 1000))
    .lean();
  res.json(items.map((c) => ({ ...c, id: String(c._id) })));
}));

const instrumentBody = z.object({
  type: z.string().optional(), model: z.string().optional(), serialNo: z.string().optional(), softwareVersion: z.string().optional(),
  cls: z.string().optional(), max_g: z.number().positive().optional(), min_g: z.number().nonnegative().optional(),
  e_g: z.number().positive().optional(), d_g: z.number().positive().optional(),
  ranges: z.array(z.object({ max_g: z.number().positive(), e_g: z.number().positive() })).optional(),
  rangeKind: z.enum(["multi_interval", "multiple_range"]).optional(),
  indication: z.enum(["digital", "analog", "non_self"]).optional(),
  power: z.enum(["mains", "battery", "external_dc", "vehicle"]).optional(),
  electronic: z.boolean().optional(), directSale: z.boolean().optional(), software: z.boolean().optional(),
  liableToTilt: z.boolean().optional(), hasTare: z.boolean().optional(), maxTare_g: z.number().nonnegative().optional(),
  maxAdditiveTare_g: z.number().nonnegative().optional(), supports: z.number().int().positive().optional(),
  receptor: z.enum(["normal", "special", "rolling"]).optional(), grading: z.boolean().optional(),
  tempLow_C: z.number().optional(), tempHigh_C: z.number().optional(), levelIndicator: z.boolean().optional(), tiltSensor: z.boolean().optional(),
  Unom_V: z.number().optional(), loadCell: z.string().optional(), indicator: z.string().optional(), receptorSize: z.string().optional(),
}).partial();

const party = z.object({ name: z.string().optional(), address: z.string().optional(), country: z.string().optional() }).partial();

const receiptBody = z.object({
  receivedAt: z.string().optional(), sampleNo: z.string().max(60).optional(), receivedFrom: z.string().max(200).optional(),
  condition: z.enum(["good", "damaged", "incomplete"]).optional(), notes: z.string().max(1000).optional(),
});
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Sample receipt (Lab In-charge). Assignment is optional here: leave it for later on the Assignments page. */
casesRouter.post("/", INCHARGE, ah(async (req, res) => {
  const b = parse(z.object({
    title: z.string().min(2), applicationNo: z.string().optional(), profile: z.enum(["OIML", "IN"]).optional(),
    assignedEngineer: z.string().optional(), manufacturer: party.optional(), applicant: party.optional(), instrument: instrumentBody.optional(),
    dueDate: z.string().optional(), priority: z.enum(["normal", "urgent"]).optional(), receipt: receiptBody.optional(),
  }), req.body);
  let eng: { name: string } | null = null;
  if (b.assignedEngineer) {
    eng = await User.findById(b.assignedEngineer).lean();
    if (!eng || (eng as any).role !== "ENGINEER" || !(eng as any).active) throw bad("Assigned user must be an active test engineer");
  }
  const receivedAt = b.receipt?.receivedAt ? new Date(b.receipt.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw bad("Received date is not a valid date");
  if (day(receivedAt) > day(new Date())) throw bad("Received date cannot be in the future");
  const due = b.dueDate ? new Date(b.dueDate) : undefined;
  if (due && Number.isNaN(due.getTime())) throw bad("Due date is not a valid date");
  if (due && day(due) < day(receivedAt)) throw bad("Due date cannot be before the date the instrument was received");
  if (b.receipt?.condition && b.receipt.condition !== "good" && !b.receipt.notes?.trim()) throw bad("Describe the damage or what is missing in the receipt notes");
  const lab = await Lab.findOne().lean();
  const profile = b.profile ?? (lab?.defaultProfile as "OIML" | "IN") ?? "OIML";
  const pack = await activePack(profile);
  const c = await Case.create({
    ...b, profile, caseNo: await nextCaseNo(), rulepack: pack._id, rulepackVersion: pack.version, rulepackHash: pack.hash,
    decisionRule: lab?.decisionRule ?? "guarded", createdBy: req.user!.id, instrument: b.instrument ?? {},
    dueDate: due, receipt: { ...b.receipt, receivedAt, condition: b.receipt?.condition ?? "good" },
  });
  await audit(req, "CASE_CREATED", "Case", String(c._id), { caseNo: c.caseNo, engineer: eng?.name ?? null, sampleNo: b.receipt?.sampleNo ?? null, rulepack: `${pack.packId}@${pack.version}` }, c._id);
  res.status(201).json({ id: String(c._id), caseNo: c.caseNo });
}));

/**
 * Assignment history (Lab In-charge): when each instrument arrived, who it was assigned to, every reassignment
 * with its reason, and the stage the case is in now. No readings or results.
 */
casesRouter.get("/assignments/history", INCHARGE, ah(async (_req, res) => {
  const cases = await Case.find().select(INCHARGE_FIELDS).populate("assignedEngineer", "name").populate("createdBy", "name").sort({ createdAt: -1 }).lean();
  const logs = await AuditLog.find({ action: { $in: ["CASE_CREATED", "CASE_ASSIGNED", "CASE_REASSIGNED"] }, case: { $in: cases.map((c) => c._id) } }).sort({ seq: 1 }).lean();
  const byCase = new Map<string, any[]>();
  for (const l of logs) { const k = String(l.case); if (!byCase.has(k)) byCase.set(k, []); byCase.get(k)!.push(l); }
  res.json(cases.map((c: any) => {
    const ev = byCase.get(String(c._id)) ?? [];
    // Case created already assigned (engineer chosen at receipt, or seeded/legacy data with no
    // CASE_CREATED log at all): the engineer at creation is the first step, and every CASE_ASSIGNED /
    // CASE_REASSIGNED event is a later reassignment. Case created unassigned: the first event is a
    // CASE_ASSIGNED with from = null (nothing to reassign from) — that one is the first step instead.
    const created = ev.find((l) => l.action === "CASE_CREATED") as any;
    const assignEvents = ev.filter((l) => l.action === "CASE_ASSIGNED" || l.action === "CASE_REASSIGNED")
      .map((l: any) => ({ at: l.at, from: l.details?.from ?? null, to: l.details?.to ?? null, by: l.actorName, reason: l.details?.reason ?? null }));
    const createdWithEngineer = created?.details?.engineer ?? null;
    const initial = !createdWithEngineer && assignEvents[0]?.from === null ? assignEvents[0] : null;
    const firstEngineer = createdWithEngineer ?? initial?.to ?? assignEvents[0]?.from ?? c.assignedEngineer?.name ?? null;
    const assignedAt = initial ? initial.at : c.createdAt;
    const assignedBy = initial ? initial.by : (c.createdBy?.name ?? null);
    const reassignments = initial ? assignEvents.slice(1) : assignEvents;
    return {
      id: String(c._id), caseNo: c.caseNo, title: c.title, model: c.instrument?.model, type: c.instrument?.type, manufacturer: c.manufacturer?.name,
      receipt: c.receipt ?? null, receivedAt: c.receipt?.receivedAt ?? c.createdAt, assignedBy, assignedAt,
      firstEngineer, engineer: c.assignedEngineer?.name ?? null, reassignments, status: c.status, dueDate: c.dueDate, signedAt: c.signedAt, revision: c.revision ?? 0,
    };
  }));
}));

casesRouter.get("/meta/attachment-categories", VIEWERS, (_req, res) => res.json(ATTACHMENT_CATEGORIES));

casesRouter.get("/:id", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  await (c as any).populate([
    { path: "assignedEngineer", select: "name email designation" },
    { path: "createdBy", select: "name email designation" },
    { path: "reviewedBy", select: "name designation" },
    { path: "approvedBy", select: "name designation" },
    { path: "signedBy", select: "name designation" },
    { path: "report", select: "reportNo verifyId revoked revokeReason signedAt sha256 revision underRevision revisionReason" },
  ]);
  const pack = await packById(String(c.rulepack));
  const [comments, attachments, sessions, readingsCount] = await Promise.all([
    Comment.find({ case: c._id }).populate("author", "name role").sort({ createdAt: 1 }).lean(),
    Attachment.find({ case: c._id }).populate("uploadedBy", "name").sort({ createdAt: -1 }).lean(),
    TestSession.find({ case: c._id }).populate("equipmentUsed", "name kind cal_due").populate("weightsUsed", "code nominal_g class").sort({ date: -1 }).lean(),
    Reading.countDocuments({ case: c._id }),
  ]);
  const obj = c.toObject();
  res.json({
    ...obj,
    id: String(c._id),
    validation: validateInstrument(toProfile(obj), pack),
    applicable: applicable(obj, pack),
    comments, attachments: attachments.map((a) => ({ ...a, id: String(a._id), path: undefined })), sessions, readingsCount,
    readiness: await readiness(c),
    reviews: reviewView(c, pack),
    lab: await Lab.findOne().select("name twoLevelApproval decisionRule").lean(),
  });
}));

/** The exact resolved rule pack this case is locked to (the browser runs the same engine with it). */
casesRouter.get("/:id/pack", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  res.json({ pack: await packById(String(c.rulepack)), hash: c.rulepackHash });
}));

casesRouter.put("/:id/instrument", ENGINEER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id, { edit: true });
  const b = parse(z.object({ instrument: instrumentBody.optional(), manufacturer: party.optional(), applicant: party.optional(), applicationNo: z.string().optional() }), req.body);
  const pack0 = await packById(String(c.rulepack));
  const approvedBefore = reviewView(c, pack0).filter((r) => r.state === "APPROVED").length;
  if (b.instrument) c.instrument = { ...(c.instrument as any)?.toObject?.() ?? c.instrument, ...b.instrument } as any;
  if (b.manufacturer) c.manufacturer = { ...(c.manufacturer as any), ...b.manufacturer };
  if (b.applicant) c.applicant = { ...(c.applicant as any), ...b.applicant };
  if (b.applicationNo !== undefined) c.applicationNo = b.applicationNo;
  await appendReading(c, "PROFILE", { instrument: b.instrument ?? null, manufacturer: b.manufacturer ?? null, applicant: b.applicant ?? null }, req.user!.id, "MANUAL");
  await recompute(c);
  await c.save();
  await audit(req, "INSTRUMENT_UPDATED", "Case", String(c._id), { fields: Object.keys(b.instrument ?? {}) }, c._id);
  const pack = await packById(String(c.rulepack));
  const approvalsCleared = approvedBefore - reviewView(c, pack).filter((r) => r.state === "APPROVED").length;
  if (approvalsCleared > 0) await audit(req, "APPROVALS_CLEARED", "Case", String(c._id), { reason: "instrument profile changed", tests: approvalsCleared }, c._id);
  res.json({ ok: true, approvalsCleared, validation: validateInstrument(toProfile(c.toObject()), pack), applicable: applicable(c.toObject(), pack) });
}));

/** Assign (first time) or reassign (Lab In-charge). A case may sit unassigned after receipt until an engineer is picked. */
casesRouter.put("/:id/assign", INCHARGE, ah(async (req, res) => {
  const b = parse(z.object({ engineer: z.string(), reason: z.string().max(500).optional(), dueDate: z.string().optional() }), req.body);
  const c = await caseFor(req, req.params.id);
  if (!EDITABLE.includes(c.status)) throw conflict("Only cases still with the test engineer (draft or returned) can be assigned");
  const eng = await User.findById(b.engineer).lean();
  if (!eng || eng.role !== "ENGINEER" || !eng.active) throw bad("Assigned user must be an active test engineer");
  if (c.assignedEngineer && String(c.assignedEngineer) === String(eng._id)) throw bad(`${eng.name} is already assigned to this case`);
  const wasAssigned = !!c.assignedEngineer;
  const from = wasAssigned ? await User.findById(c.assignedEngineer).select("name").lean() : null;
  const hasData = await Reading.exists({ case: c._id });
  if (hasData && !b.reason?.trim()) throw bad("Readings have already been entered; give a reason for the reassignment");
  if (b.dueDate) {
    const due = new Date(b.dueDate);
    if (Number.isNaN(due.getTime())) throw bad("Due date is not a valid date");
    c.dueDate = due;
  }
  c.assignedEngineer = eng._id;
  await c.save();
  await audit(req, wasAssigned ? "CASE_REASSIGNED" : "CASE_ASSIGNED", "Case", String(c._id), { from: from?.name ?? null, to: eng.name, reason: b.reason ?? null }, c._id);
  res.json({ ok: true });
}));

/** Save one test's inputs. The server recomputes every verdict; client verdicts are ignored. */
casesRouter.put("/:id/tests/:testId", ENGINEER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id, { edit: true });
  const pack = await packById(String(c.rulepack));
  const { testId } = req.params;
  if (!pack.tests.some((t) => t.id === testId)) throw bad(`Unknown test ${testId}`);
  await assertTestEditable(c, testId);
  const b = parse(z.object({ input: z.any(), source: z.enum(["DEVICE", "MANUAL", "MIXED"]).optional() }), req.body);
  if (JSON.stringify(b.input ?? null).length > 200_000) throw bad("Input too large");
  const inputs = { ...((c.testInputs as any) ?? {}) };
  inputs[testId] = stripVerdicts(b.input);
  c.testInputs = inputs;
  c.markModified("testInputs");
  const r = await appendReading(c, testId, inputs[testId], req.user!.id, b.source ?? "MANUAL");
  await recompute(c);
  await c.save();
  await audit(req, "READINGS_SAVED", "Case", String(c._id), { testId, seq: r.seq, source: b.source ?? "MANUAL" }, c._id);
  const result = (c.results as any[]).find((x) => x.testId === testId) ?? null;
  res.json({ ok: true, seq: r.seq, hash: r.hash, result, verdict: c.verdict, counts: c.counts, plausibilityFlags: c.plausibilityFlags });
}));

/** Remove any verdict-like fields a client may send. */
function stripVerdicts(v: any): any {
  if (Array.isArray(v)) return v.map(stripVerdicts);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) if (!["verdict", "Ec", "E", "mpe", "E0"].includes(k)) o[k] = stripVerdicts(x);
    return o;
  }
  return v;
}

// ---------- Test sessions (environment) ----------
casesRouter.post("/:id/sessions", ENGINEER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id, { edit: true });
  const b = parse(z.object({
    testId: z.string().optional(), date: z.string().optional(), T_C: z.number().min(-40).max(80), RH_pct: z.number().min(0).max(100),
    p_hPa: z.number().min(500).max(1200).optional(), equipmentUsed: z.array(z.string()).optional(), weightsUsed: z.array(z.string()).optional(), notes: z.string().optional(),
  }), req.body);
  const { Equipment, Weight } = await import("../models");
  const today = new Date().toISOString().slice(0, 10);
  const expiredEq = await Equipment.find({ _id: { $in: b.equipmentUsed ?? [] }, cal_due: { $lt: today } }).lean();
  const expiredW = await Weight.find({ _id: { $in: b.weightsUsed ?? [] }, cal_due: { $lt: today } }).lean();
  if (expiredEq.length || expiredW.length) {
    throw bad(`Calibration expired: ${[...expiredEq.map((e) => e.name), ...expiredW.map((w) => w.code)].join(", ")}`);
  }
  const s = await TestSession.create({ ...b, case: c._id, date: b.date ? new Date(b.date) : new Date(), user: req.user!.id });
  await appendReading(c, "SESSION", { T_C: b.T_C, RH_pct: b.RH_pct, p_hPa: b.p_hPa ?? null, testId: b.testId ?? null }, req.user!.id, "MANUAL");
  await c.save();
  await audit(req, "SESSION_ADDED", "TestSession", String(s._id), { T_C: b.T_C, RH_pct: b.RH_pct }, c._id);
  res.status(201).json({ id: String(s._id) });
}));

// ---------- Attachments ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _f, cb) => { const d = path.join(config.storageDir, "attachments"); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (_req, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, /^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(f.mimetype)),
});

casesRouter.post("/:id/attachments", ENGINEER, upload.single("file"), ah(async (req, res) => {
  const c = await caseFor(req, req.params.id, { edit: true });
  if (!req.file) throw bad("File missing or type not allowed (PNG, JPG, WEBP, PDF)");
  const b = parse(z.object({ category: z.enum(ATTACHMENT_CATEGORIES.map((x) => x.id) as [string, ...string[]]), testId: z.string().optional(), caption: z.string().optional() }), req.body);
  const buf = fs.readFileSync(req.file.path);
  const a = await Attachment.create({
    case: c._id, category: b.category, testId: b.testId, caption: b.caption, filename: req.file.originalname, path: req.file.path,
    mime: req.file.mimetype, size: req.file.size, sha256: sha256(buf), uploadedBy: req.user!.id,
  });
  await audit(req, "ATTACHMENT_ADDED", "Attachment", String(a._id), { category: b.category, sha256: a.sha256, filename: a.filename }, c._id);
  res.status(201).json({ id: String(a._id), sha256: a.sha256 });
}));

casesRouter.get("/:id/attachments/:attId/file", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const a = await Attachment.findOne({ _id: req.params.attId, case: c._id }).lean();
  if (!a || !a.path || !fs.existsSync(a.path)) throw notFound("Attachment");
  res.setHeader("Content-Type", a.mime ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(a.filename ?? "file")}"`);
  fs.createReadStream(a.path).pipe(res);
}));

casesRouter.delete("/:id/attachments/:attId", ENGINEER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id, { edit: true });
  const a = await Attachment.findOneAndDelete({ _id: req.params.attId, case: c._id });
  if (!a) throw notFound("Attachment");
  await audit(req, "ATTACHMENT_REMOVED", "Attachment", String(a._id), { filename: a.filename, sha256: a.sha256 }, c._id);
  res.json({ ok: true });
}));

// ---------- Comments ----------
casesRouter.post("/:id/comments", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const b = parse(z.object({ text: z.string().min(1).max(4000), testId: z.string().optional() }), req.body);
  const cm = await Comment.create({ case: c._id, testId: b.testId, text: b.text, author: req.user!.id, role: req.user!.role });
  await audit(req, "COMMENT_ADDED", "Comment", String(cm._id), { testId: b.testId ?? null }, c._id);
  res.status(201).json({ id: String(cm._id) });
}));

casesRouter.post("/:id/comments/:cid/resolve", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  await Comment.updateOne({ _id: req.params.cid, case: c._id }, { resolved: true });
  res.json({ ok: true });
}));

// ---------- Workflow ----------
/** What still blocks submission. */
export async function readiness(c: any) {
  const pack = await packById(String(c.rulepack));
  const obj = c.toObject ? c.toObject() : c;
  const blockers: string[] = [];
  const v = validateInstrument(toProfile(obj), pack);
  if (!obj.instrument?.max_g) blockers.push("Instrument profile not entered");
  else if (!v.valid) blockers.push("Instrument profile has errors: " + v.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
  const results: any[] = obj.results ?? [];
  const app = applicable(obj, pack).filter((t) => t.applicable);
  const pending = app.filter((t) => { const r = results.find((x) => x.testId === t.id); return !r || r.verdict === "NOT_TESTED"; });
  if (pending.length) blockers.push(`Tests incomplete: ${pending.map((t) => t.id).join(", ")}`);
  const cats = new Set((await Attachment.find({ case: c._id }).select("category").lean()).map((a) => a.category));
  const missing = ATTACHMENT_CATEGORIES.filter((a) => a.required && !cats.has(a.id));
  if (missing.length) blockers.push(`Required attachments missing: ${missing.map((m) => m.label).join(", ")}`);
  if (!(await TestSession.exists({ case: c._id }))) blockers.push("No environment (T / RH / p) record");
  return { ready: blockers.length === 0, blockers, pendingTests: pending.map((t) => t.id), missingAttachments: missing.map((m) => m.id) };
}

casesRouter.post("/:id/submit", ENGINEER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id, { edit: true });
  const { confirmUnchanged } = parse(z.object({ confirmUnchanged: z.boolean().optional() }), req.body ?? {});
  await recompute(c);
  const r = await readiness(c);
  if (!r.ready) throw bad("Case is not ready to submit", r.blockers);
  const pack = await packById(String(c.rulepack));
  const view = reviewView(c, pack);
  const unchanged = view.filter((x) => x.state === "RETURNED" && x.unchanged).map((x) => x.testId);
  if (unchanged.length && !confirmUnchanged) {
    throw conflict(`These tests were sent back but have no new readings: ${unchanged.join(", ")}. Re-test them, or confirm to submit anyway.`, { unchanged });
  }
  // Tests that were sent back go to the senior engineer again.
  for (const x of view) if (x.state === "RETURNED") setReview(c, x.testId, { state: "PENDING", note: x.note });
  const chain = await verifyChain(c._id);
  if (!chain.ok) throw conflict("Recorded data for this case appears to have been altered. Contact the administrator.");
  c.status = "SUBMITTED";
  c.submittedAt = new Date();
  await c.save();
  await Comment.updateMany({ case: c._id, kind: "return", resolved: false }, { resolved: true });
  await audit(req, "CASE_SUBMITTED", "Case", String(c._id), { verdict: c.verdict, chainHead: chain.head, revision: c.revision ?? 0, unchangedConfirmed: unchanged.length ? unchanged : undefined }, c._id);
  res.json({ ok: true, status: c.status });
}));

const testNotes = z.array(z.object({ testId: z.string(), text: z.string().trim().min(3, "Write what must be re-tested") })).max(30);

/** Mark tests RETURNED with the note, recording the readings' hash so an unchanged resubmission can be detected. */
async function sendBack(req: Request, c: any, notes: Array<{ testId: string; text: string }>, pack: any) {
  const app = new Set(reviewView(c, pack).map((x) => x.testId));
  const wrong = notes.filter((n) => !app.has(n.testId)).map((n) => n.testId);
  if (wrong.length) throw bad(`Not an applicable test for this instrument: ${wrong.join(", ")}`);
  const seen = new Set<string>();
  for (const n of notes) {
    if (seen.has(n.testId)) throw bad(`${n.testId} is listed twice`);
    seen.add(n.testId);
  }
  for (const n of notes) {
    setReview(c, n.testId, {
      state: "RETURNED", by: req.user!.id, byName: req.user!.name, at: new Date().toISOString(), note: n.text,
      inputHash: hashInput((c.testInputs as any)?.[n.testId]),
    });
    await Comment.create({ case: c._id, testId: n.testId, text: n.text, author: req.user!.id, role: "APPROVER", kind: "return" });
  }
}

/** Send the case back: particular tests for re-test and/or a general comment. */
casesRouter.post("/:id/return", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const b = parse(z.object({ comment: z.string().trim().optional(), testComments: testNotes.optional() }), req.body);
  if (!["SUBMITTED", "REVIEWED"].includes(c.status)) throw conflict(`Cannot return a ${c.status} case`);
  if (!b.testComments?.length && (b.comment ?? "").length < 3) throw bad("Select the tests to re-test, or write a comment for the engineer");
  await assertChecker(req, c);
  const pack = await packById(String(c.rulepack));
  await sendBack(req, c, b.testComments ?? [], pack);
  c.status = "RETURNED";
  c.returnedAt = new Date();
  c.reviewedBy = undefined;
  await c.save();
  if (b.comment && b.comment.length >= 3) await Comment.create({ case: c._id, text: b.comment, author: req.user!.id, role: "APPROVER", kind: "return" });
  await audit(req, "CASE_RETURNED", "Case", String(c._id), { comment: b.comment ?? null, tests: (b.testComments ?? []).map((t) => t.testId) }, c._id);
  res.json({ ok: true, status: c.status });
}));

// ---------- Per-test review (senior engineer) ----------
const REVIEWABLE = ["SUBMITTED"];

casesRouter.post("/:id/tests/:testId/approve", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  if (!REVIEWABLE.includes(c.status)) throw conflict(`Tests can be approved only while the case is submitted for review (now ${c.status})`);
  await assertChecker(req, c);
  const { note } = parse(z.object({ note: z.string().trim().max(1000).optional() }), req.body ?? {});
  const pack = await packById(String(c.rulepack));
  await recompute(c);
  const t = reviewView(c, pack).find((x) => x.testId === req.params.testId);
  if (!t) throw bad(`${req.params.testId} does not apply to this instrument`);
  if (t.current === "NOT_TESTED") throw conflict(`${t.testId} is incomplete; send it back to the engineer instead`);
  if ((t.current === "FAIL" || t.current === "CONDITIONAL") && (note ?? "").length < 3) {
    throw bad(`${t.testId} is ${t.current}. Add a note confirming the result is correct (the report will state ${t.current}), or send it back for re-test`);
  }
  setReview(c, t.testId, approvalFor(c, t.testId, req.user!, note));
  await c.save();
  await audit(req, "TEST_APPROVED", "Case", String(c._id), { testId: t.testId, verdict: t.current, note: note ?? null }, c._id);
  res.json({ ok: true, reviews: reviewView(c, pack) });
}));

casesRouter.post("/:id/tests/:testId/unapprove", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  if (!REVIEWABLE.includes(c.status)) throw conflict(`Case is ${c.status}`);
  const s = storedReviews(c)[req.params.testId];
  if (s?.state !== "APPROVED") throw conflict(`${req.params.testId} is not approved`);
  setReview(c, req.params.testId, { state: "PENDING" });
  await c.save();
  await audit(req, "TEST_APPROVAL_UNDONE", "Case", String(c._id), { testId: req.params.testId }, c._id);
  res.json({ ok: true, reviews: reviewView(c, await packById(String(c.rulepack))) });
}));

/** Approve every test whose result is PASS in one step (FAIL / CONDITIONAL still need an explicit decision). */
casesRouter.post("/:id/tests/approve-passing", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  if (!REVIEWABLE.includes(c.status)) throw conflict(`Tests can be approved only while the case is submitted for review (now ${c.status})`);
  await assertChecker(req, c);
  const pack = await packById(String(c.rulepack));
  await recompute(c);
  const ids = reviewView(c, pack).filter((t) => t.state === "PENDING" && t.current === "PASS").map((t) => t.testId);
  for (const id of ids) setReview(c, id, approvalFor(c, id, req.user!));
  await c.save();
  if (ids.length) await audit(req, "TEST_APPROVED", "Case", String(c._id), { tests: ids, verdict: "PASS", bulk: true }, c._id);
  res.json({ ok: true, approved: ids, reviews: reviewView(c, pack) });
}));

async function assertAllApproved(c: any) {
  const pack = await packById(String(c.rulepack));
  const left = notApproved(c, pack);
  if (left.length) throw conflict(`Approve every test first. Not approved yet: ${left.map((x) => x.testId).join(", ")}`, { pending: left.map((x) => x.testId) });
}

/**
 * Reopen a signed case for re-test (senior engineer). The issued report stays valid, marked "under revision",
 * until the revised report is signed, which then supersedes it.
 */
casesRouter.post("/:id/reopen", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const b = parse(z.object({
    reason: z.string().trim().min(10, "Give the reason for the revision (at least 10 characters)"),
    testComments: testNotes.min(1, "Select at least one test to re-test"),
  }), req.body);
  if (c.status !== "SIGNED") throw conflict("Only signed cases can be reopened for a revised report");
  await assertChecker(req, c);
  const pack = await packById(String(c.rulepack));
  await recompute(c);
  // Tests not sent back keep the approval they had in the signed report.
  const back = new Set(b.testComments.map((t) => t.testId));
  for (const t of reviewView(c, pack)) {
    if (!back.has(t.testId) && t.state !== "APPROVED") setReview(c, t.testId, { ...approvalFor(c, t.testId, req.user!), note: "Approved in the signed report" });
  }
  await sendBack(req, c, b.testComments, pack);
  c.status = "RETURNED";
  c.locked = false;
  c.revision = (c.revision ?? 0) + 1;
  c.returnedAt = new Date();
  c.reviewedBy = undefined;
  c.approvedBy = undefined;
  c.approvedAt = undefined;
  await c.save();
  if (c.report) await Report.updateOne({ _id: c.report }, { underRevision: true, revisionReason: b.reason });
  await Comment.create({ case: c._id, text: `Reopened for revision ${c.revision}: ${b.reason}`, author: req.user!.id, role: "APPROVER", kind: "return" });
  await audit(req, "CASE_REOPENED", "Case", String(c._id), { revision: c.revision, reason: b.reason, tests: [...back] }, c._id);
  res.json({ ok: true, status: c.status, revision: c.revision });
}));

async function assertChecker(req: Request, c: any) {
  const makers = await makersOf(c._id, c.assignedEngineer);
  if (makers.has(req.user!.id)) throw forbidden("You entered readings for this case, so you cannot approve or sign it");
}

casesRouter.post("/:id/review", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const lab = await Lab.findOne().lean();
  if (!lab?.twoLevelApproval) throw conflict("Two-level approval is not enabled");
  if (c.status !== "SUBMITTED") throw conflict(`Cannot review a ${c.status} case`);
  await assertChecker(req, c);
  await assertAllApproved(c);
  c.status = "REVIEWED";
  c.reviewedBy = req.user!.id as any;
  await c.save();
  await Comment.create({ case: c._id, text: (req.body?.comment as string) || "Reviewed", author: req.user!.id, role: "APPROVER", kind: "review" });
  await audit(req, "CASE_REVIEWED", "Case", String(c._id), {}, c._id);
  res.json({ ok: true, status: c.status });
}));

casesRouter.post("/:id/approve", APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const lab = await Lab.findOne().lean();
  const need = lab?.twoLevelApproval ? "REVIEWED" : "SUBMITTED";
  if (c.status !== need) throw conflict(lab?.twoLevelApproval ? "Case must be reviewed by another approver first" : `Cannot approve a ${c.status} case`);
  await assertChecker(req, c);
  if (lab?.twoLevelApproval && String(c.reviewedBy) === req.user!.id) throw forbidden("Two-level approval: reviewer and approver must be different people");
  await recompute(c);
  await assertAllApproved(c);
  c.status = "APPROVED";
  c.approvedBy = req.user!.id as any;
  c.approvedAt = new Date();
  await c.save();
  await Comment.create({ case: c._id, text: (req.body?.comment as string) || "Approved", author: req.user!.id, role: "APPROVER", kind: "approve" });
  await audit(req, "CASE_APPROVED", "Case", String(c._id), { verdict: c.verdict }, c._id);
  res.json({ ok: true, status: c.status });
}));

casesRouter.get("/:id/chain", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  res.json(await verifyChain(c._id));
}));

casesRouter.get("/:id/readings", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const rs = await Reading.find({ case: c._id }).populate("user", "name").sort({ seq: -1 }).limit(500).lean();
  res.json(rs);
}));

casesRouter.get("/:id/audit", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  res.json(await AuditLog.find({ case: c._id }).sort({ seq: -1 }).limit(500).lean());
}));

casesRouter.get("/:id/readiness", CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  res.json(await readiness(c));
}));

export { recompute };
