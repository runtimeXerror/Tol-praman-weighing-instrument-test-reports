import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { ah } from "../lib/http";
import { AuditLog, Case, Equipment, Report, RulePack, User, Weight } from "../models";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const days = (a?: Date | null, b?: Date | null) => (a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000) : null);

/** Lab dashboard (APPROVER). */
dashboardRouter.get("/lab", requireRole("APPROVER"), ah(async (_req, res) => {
  const cases = await Case.find().select("caseNo title status verdict results createdAt submittedAt signedAt approvedAt assignedEngineer instrument.model instrument.cls profile dueDate priority plausibilityFlags").populate("assignedEngineer", "name").lean();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const byStatus: Record<string, number> = {};
  for (const c of cases) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

  const fails: Record<string, { testId: string; name: string; fail: number; conditional: number }> = {};
  for (const c of cases) for (const r of (c.results as any[]) ?? []) {
    if (r.verdict !== "FAIL" && r.verdict !== "CONDITIONAL") continue;
    fails[r.testId] ??= { testId: r.testId, name: r.name, fail: 0, conditional: 0 };
    if (r.verdict === "FAIL") fails[r.testId].fail++; else fails[r.testId].conditional++;
  }

  const monthly: Record<string, { month: string; created: number; signed: number }> = {};
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = d.toISOString().slice(0, 7);
    monthly[key] = { month: key, created: 0, signed: 0 };
  }
  for (const c of cases) {
    const ck = new Date((c as any).createdAt).toISOString().slice(0, 7);
    if (monthly[ck]) monthly[ck].created++;
    if (c.signedAt) { const sk = new Date(c.signedAt).toISOString().slice(0, 7); if (monthly[sk]) monthly[sk].signed++; }
  }

  const engineers = await User.find({ role: "ENGINEER", active: true }).select("name").lean();
  const workload = engineers.map((e) => ({
    id: String(e._id), name: e.name,
    active: cases.filter((c: any) => String(c.assignedEngineer?._id) === String(e._id) && ["DRAFT", "RETURNED"].includes(c.status)).length,
    submitted: cases.filter((c: any) => String(c.assignedEngineer?._id) === String(e._id) && ["SUBMITTED", "REVIEWED", "APPROVED"].includes(c.status)).length,
    signed: cases.filter((c: any) => String(c.assignedEngineer?._id) === String(e._id) && c.status === "SIGNED").length,
  }));

  const turnaround = cases.filter((c) => c.signedAt).map((c: any) => ({ caseNo: c.caseNo, model: c.instrument?.model, days: +days(c.createdAt, c.signedAt)!.toFixed(1) }));
  const avgTat = turnaround.length ? +(turnaround.reduce((a, b) => a + b.days, 0) / turnaround.length).toFixed(1) : null;

  res.json({
    kpis: {
      inProcess: (byStatus.DRAFT ?? 0) + (byStatus.RETURNED ?? 0),
      awaitingReview: (byStatus.SUBMITTED ?? 0) + (byStatus.REVIEWED ?? 0),
      awaitingSignature: byStatus.APPROVED ?? 0,
      conditionalFlags: cases.filter((c) => c.verdict === "CONDITIONAL" && c.status !== "SIGNED").length,
      failing: cases.filter((c) => c.verdict === "FAIL" && c.status !== "SIGNED").length,
      signedThisMonth: cases.filter((c) => c.signedAt && new Date(c.signedAt) >= monthStart).length,
      overdue: cases.filter((c) => c.dueDate && new Date(c.dueDate) < now && c.status !== "SIGNED").length,
      plausibilityFlags: cases.reduce((a, c: any) => a + (c.plausibilityFlags?.length ?? 0), 0),
      avgTurnaroundDays: avgTat,
      total: cases.length,
    },
    byStatus,
    failureFrequency: Object.values(fails).sort((a, b) => b.fail + b.conditional - (a.fail + a.conditional)),
    monthly: Object.values(monthly),
    workload,
    turnaround: turnaround.slice(-15),
  });
}));

/** Tests left on a case = applicable tests still NOT_TESTED (counts come from the last recompute). */
const testsLeft = (c: any) => c.counts?.NOT_TESTED ?? 0;

/** Lab In-charge home: intake, who is doing what, and what is late. */
dashboardRouter.get("/incharge", requireRole("INCHARGE"), ah(async (_req, res) => {
  const cases = await Case.find()
    .select("caseNo title status counts createdAt submittedAt signedAt dueDate priority assignedEngineer receipt instrument.model revision")
    .populate("assignedEngineer", "name").lean();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const open = (c: any) => c.status !== "SIGNED";
  const withEngineer = (c: any) => ["DRAFT", "RETURNED"].includes(c.status);
  const overdue = (c: any) => open(c) && c.dueDate && new Date(c.dueDate) < now;
  const engineers = await User.find({ role: "ENGINEER", active: true }).select("name designation").sort({ name: 1 }).lean();
  const workload = engineers.map((e) => {
    const mine = cases.filter((c: any) => String(c.assignedEngineer?._id) === String(e._id));
    const active = mine.filter(withEngineer);
    const next = active.filter((c: any) => c.dueDate).sort((a: any, b: any) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
    return {
      id: String(e._id), name: e.name, designation: e.designation,
      activeCases: active.length,
      testsLeft: active.reduce((n, c) => n + testsLeft(c), 0),
      returned: active.filter((c: any) => c.status === "RETURNED").length,
      withSenior: mine.filter((c: any) => ["SUBMITTED", "REVIEWED", "APPROVED"].includes(c.status)).length,
      overdue: mine.filter(overdue).length,
      nextDue: next ? { caseNo: next.caseNo, dueDate: next.dueDate } : null,
    };
  });
  const unassigned = (c: any) => open(c) && !c.assignedEngineer;
  res.json({
    kpis: {
      receivedThisMonth: cases.filter((c: any) => new Date(c.receipt?.receivedAt ?? c.createdAt) >= monthStart).length,
      unassigned: cases.filter(unassigned).length,
      withEngineers: cases.filter(withEngineer).length,
      withSenior: cases.filter((c: any) => ["SUBMITTED", "REVIEWED", "APPROVED"].includes(c.status)).length,
      overdue: cases.filter(overdue).length,
      signedThisMonth: cases.filter((c: any) => c.signedAt && new Date(c.signedAt) >= monthStart).length,
      damagedOnReceipt: cases.filter((c: any) => open(c) && c.receipt?.condition && c.receipt.condition !== "good").length,
    },
    workload,
    openCases: cases.filter(open).map((c: any) => ({
      id: String(c._id), caseNo: c.caseNo, title: c.title, status: c.status, dueDate: c.dueDate, receipt: c.receipt,
      assignedEngineer: c.assignedEngineer, testsLeft: testsLeft(c), overdue: !!overdue(c), unassigned: !c.assignedEngineer,
    })),
  });
}));

/** Engineer home: own counts. */
dashboardRouter.get("/me", requireRole("ENGINEER"), ah(async (req, res) => {
  const cases = await Case.find({ assignedEngineer: req.user!.id }).select("status verdict dueDate").lean();
  const count = (s: string[]) => cases.filter((c) => s.includes(c.status)).length;
  res.json({ draft: count(["DRAFT"]), returned: count(["RETURNED"]), submitted: count(["SUBMITTED", "REVIEWED", "APPROVED"]), signed: count(["SIGNED"]), total: cases.length });
}));

/** Admin home: system health. */
dashboardRouter.get("/admin", requireRole("ADMIN"), ah(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [users, weightsExpired, weightsSoon, eqExpired, eqSoon, packs, audits, reports] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 }, active: { $sum: { $cond: ["$active", 1, 0] } } } }]),
    Weight.countDocuments({ cal_due: { $lt: today } }),
    Weight.countDocuments({ cal_due: { $gte: today, $lte: soon } }),
    Equipment.countDocuments({ cal_due: { $lt: today } }),
    Equipment.countDocuments({ cal_due: { $gte: today, $lte: soon } }),
    RulePack.find({ active: true }).select("packId profile version hash").lean(),
    AuditLog.find().sort({ seq: -1 }).limit(8).lean(),
    Report.countDocuments(),
  ]);
  res.json({ users, weightsExpired, weightsSoon, eqExpired, eqSoon, activePacks: packs, recentAudit: audits, reports });
}));
