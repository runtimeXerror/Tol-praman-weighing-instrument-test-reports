import { Router } from "express";
import { z } from "zod";
import { evaluateCase } from "@tolpraman/engine";
import { hashPassword, requireAuth, requireRole } from "../auth";
import { audit, verifyAuditChain } from "../lib/audit";
import { toProfile } from "../lib/compute";
import { ah, bad, notFound, parse } from "../lib/http";
import { prepareUpload } from "../lib/packs";
import { AuditLog, Case, Equipment, Lab, ROLES, RulePack, User, Weight } from "../models";

export const adminRouter = Router();
adminRouter.use(requireAuth);

const ADMIN = requireRole("ADMIN");
const ANY = requireRole("INCHARGE", "ENGINEER", "APPROVER", "ADMIN");

// ---------- Users & roles (ADMIN) ----------
const userBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(ROLES),
  designation: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
  active: z.boolean().optional(),
});

adminRouter.get("/users", requireRole("ADMIN", "INCHARGE"), ah(async (req, res) => {
  const q: any = {};
  if (req.query.role) q.role = req.query.role;
  // The Lab In-charge only needs the list of active engineers to assign cases
  if (req.user!.role === "INCHARGE") { q.role = "ENGINEER"; q.active = true; }
  const users = await User.find(q).select("-passwordHash -tokenVersion").sort({ role: 1, name: 1 }).lean();
  res.json(users.map((u) => ({ ...u, id: String(u._id) })));
}));

adminRouter.post("/users", ADMIN, ah(async (req, res) => {
  const b = parse(userBody.required({ password: true }), req.body);
  const u = await User.create({ ...b, email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), mustChangePassword: true });
  await audit(req, "USER_CREATED", "User", String(u._id), { email: u.email, role: u.role });
  res.status(201).json({ id: String(u._id) });
}));

adminRouter.put("/users/:id", ADMIN, ah(async (req, res) => {
  const b = parse(userBody.partial(), req.body);
  const u = await User.findById(req.params.id);
  if (!u) throw notFound("User");
  if (String(u._id) === req.user!.id && (b.active === false || (b.role && b.role !== "ADMIN"))) throw bad("You cannot disable or demote yourself");
  const { password, ...rest } = b;
  Object.assign(u, rest);
  if (rest.email) u.email = rest.email.toLowerCase();
  if (password) { u.passwordHash = await hashPassword(password); u.tokenVersion = (u.tokenVersion ?? 0) + 1; u.mustChangePassword = true; }
  if (b.active === false || b.role) u.tokenVersion = (u.tokenVersion ?? 0) + 1;
  await u.save();
  await audit(req, "USER_UPDATED", "User", String(u._id), { fields: Object.keys(b).filter((k) => k !== "password"), passwordReset: !!password });
  res.json({ ok: true });
}));

// ---------- Lab profile & settings ----------
adminRouter.get("/lab", ANY, ah(async (_req, res) => {
  res.json(await Lab.findOne().lean());
}));

adminRouter.put("/lab", ADMIN, ah(async (req, res) => {
  const b = parse(z.object({
    name: z.string().min(2), nameHi: z.string().optional(), shortName: z.string().optional(), address: z.string().optional(),
    phone: z.string().optional(), email: z.string().optional(), accreditationNo: z.string().optional(),
    twoLevelApproval: z.boolean().optional(), decisionRule: z.enum(["simple", "guarded"]).optional(), defaultProfile: z.enum(["OIML", "IN"]).optional(),
  }).partial(), req.body);
  const lab = await Lab.findOneAndUpdate({}, b, { new: true, upsert: true });
  await audit(req, "LAB_UPDATED", "Lab", String(lab!._id), { fields: Object.keys(b) });
  res.json(lab);
}));

// ---------- Weights register ----------
const today = () => new Date().toISOString().slice(0, 10);
const withStatus = (x: any) => ({ ...x, id: String(x._id), expired: x.cal_due < today() });

adminRouter.get("/weights", ANY, ah(async (_req, res) => {
  res.json((await Weight.find().sort({ nominal_g: -1, code: 1 }).lean()).map(withStatus));
}));
const weightBody = z.object({
  code: z.string().min(1), nominal_g: z.number().positive(), class: z.enum(["E1", "E2", "F1", "F2", "M1", "M1-2", "M2", "M2-3", "M3"]),
  conventional_mass_g: z.number().positive(), U_g: z.number().nonnegative(), cal_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  certificate: z.string().optional(), setName: z.string().optional(), active: z.boolean().optional(),
});
adminRouter.post("/weights", ADMIN, ah(async (req, res) => {
  const w = await Weight.create(parse(weightBody, req.body));
  await audit(req, "WEIGHT_CREATED", "Weight", String(w._id), { code: w.code });
  res.status(201).json(withStatus(w.toObject()));
}));
adminRouter.put("/weights/:id", ADMIN, ah(async (req, res) => {
  const w = await Weight.findByIdAndUpdate(req.params.id, parse(weightBody.partial(), req.body), { new: true });
  if (!w) throw notFound("Weight");
  await audit(req, "WEIGHT_UPDATED", "Weight", String(w._id), { code: w.code });
  res.json(withStatus(w.toObject()));
}));

// ---------- Equipment register ----------
adminRouter.get("/equipment", ANY, ah(async (_req, res) => {
  res.json((await Equipment.find().sort({ kind: 1, name: 1 }).lean()).map(withStatus));
}));
const eqBody = z.object({
  name: z.string().min(1), kind: z.string().min(1), make: z.string().optional(), serial: z.string().optional(),
  cal_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), certificate: z.string().optional(), active: z.boolean().optional(),
});
adminRouter.post("/equipment", ADMIN, ah(async (req, res) => {
  const e = await Equipment.create(parse(eqBody, req.body));
  await audit(req, "EQUIPMENT_CREATED", "Equipment", String(e._id), { name: e.name });
  res.status(201).json(withStatus(e.toObject()));
}));
adminRouter.put("/equipment/:id", ADMIN, ah(async (req, res) => {
  const e = await Equipment.findByIdAndUpdate(req.params.id, parse(eqBody.partial(), req.body), { new: true });
  if (!e) throw notFound("Equipment");
  await audit(req, "EQUIPMENT_UPDATED", "Equipment", String(e._id), { name: e.name });
  res.json(withStatus(e.toObject()));
}));

// ---------- Rule packs ----------
adminRouter.get("/rulepacks", ANY, ah(async (_req, res) => {
  const packs = await RulePack.find().select("-raw -resolved").sort({ profile: 1, createdAt: -1 }).lean();
  const usage = await Case.aggregate([{ $group: { _id: "$rulepack", n: { $sum: 1 } } }]);
  const used = new Map(usage.map((u) => [String(u._id), u.n]));
  res.json(packs.map((p) => ({ ...p, id: String(p._id), cases: used.get(String(p._id)) ?? 0 })));
}));

adminRouter.get("/rulepacks/:id", ANY, ah(async (req, res) => {
  const p = await RulePack.findById(req.params.id).lean();
  if (!p) throw notFound("Rule pack");
  res.json({ ...p, id: String(p._id) });
}));

adminRouter.post("/rulepacks/validate", ADMIN, ah(async (req, res) => {
  try {
    const { resolved, hash } = await prepareUpload(req.body);
    res.json({ valid: true, hash, id: resolved.id, version: resolved.version, profile: resolved.profile });
  } catch (e: any) {
    res.json({ valid: false, error: e.message, details: e.details });
  }
}));

adminRouter.post("/rulepacks", ADMIN, ah(async (req, res) => {
  const raw = req.body;
  const { resolved, hash } = await prepareUpload(raw);
  const p = await RulePack.create({
    packId: resolved.id, profile: resolved.profile, version: resolved.version, title: resolved.title,
    raw, resolved, hash, active: false, uploadedBy: req.user!.id,
  });
  await audit(req, "RULEPACK_UPLOADED", "RulePack", String(p._id), { packId: p.packId, version: p.version, hash });
  res.status(201).json({ id: String(p._id), hash });
}));

adminRouter.post("/rulepacks/:id/activate", ADMIN, ah(async (req, res) => {
  const p = await RulePack.findById(req.params.id);
  if (!p) throw notFound("Rule pack");
  await RulePack.updateMany({ profile: p.profile }, { active: false });
  p.active = true;
  await p.save();
  await audit(req, "RULEPACK_ACTIVATED", "RulePack", String(p._id), { packId: p.packId, version: p.version });
  res.json({ ok: true });
}));

/**
 * Impact simulator: re-run the engine over all signed cases with a candidate pack and list the
 * verdicts that would change. Read-only: signed cases and reports are never modified.
 */
adminRouter.post("/rulepacks/:id/impact", requireRole("ADMIN", "APPROVER"), ah(async (req, res) => {
  const cand = await RulePack.findById(req.params.id).lean();
  if (!cand) throw notFound("Rule pack");
  const cases = await Case.find({ status: "SIGNED", profile: cand.profile }).lean();
  const changes = [];
  for (const c of cases) {
    const ev = evaluateCase(toProfile(c), cand.resolved as any, (c.testInputs as any) ?? {}, { rule: (c.decisionRule as any) ?? "simple" });
    const before = new Map(((c.results as any[]) ?? []).map((r) => [r.testId, r.verdict]));
    const diffs = ev.results.filter((r) => before.get(r.testId) !== r.verdict).map((r) => ({ testId: r.testId, name: r.name, before: before.get(r.testId) ?? null, after: r.verdict }));
    changes.push({ caseId: String(c._id), caseNo: c.caseNo, model: c.instrument?.model, before: c.verdict, after: ev.verdict, changed: diffs.length > 0, diffs });
  }
  await audit(req, "IMPACT_SIMULATED", "RulePack", String(cand._id), { cases: cases.length, changed: changes.filter((c) => c.changed).length });
  res.json({ pack: { id: String(cand._id), packId: cand.packId, version: cand.version }, total: cases.length, changed: changes.filter((c) => c.changed).length, cases: changes });
}));

// ---------- Audit log (ADMIN) ----------
adminRouter.get("/audit", ADMIN, ah(async (req, res) => {
  const q: any = {};
  if (req.query.action) q.action = req.query.action;
  if (req.query.caseId) q.case = req.query.caseId;
  const limit = Math.min(Number(req.query.limit ?? 200), 1000);
  const items = await AuditLog.find(q).sort({ seq: -1 }).limit(limit).lean();
  res.json(items);
}));

adminRouter.get("/audit/verify", ADMIN, ah(async (_req, res) => {
  res.json(await verifyAuditChain());
}));
