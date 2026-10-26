import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import QRCode from "qrcode";
import { z } from "zod";
import { validateInstrument } from "@tolpraman/engine";
import { requireAuth, requireRole } from "../auth";
import { config } from "../config";
import { audit } from "../lib/audit";
import { recompute, toProfile, verifyChain } from "../lib/compute";
import { randomId, sha256 } from "../lib/hash";
import { ah, bad, conflict, forbidden, notFound, parse } from "../lib/http";
import { packById } from "../lib/packs";
import { labKeyId, labPublicKeyPem, SIG_ALG, signStatement, statementFor, verifyStatement } from "../lib/signing";
import { Attachment, Case, Equipment, Lab, Report, TestSession, User, Weight } from "../models";
import { reportDocx } from "../reports/docx";
import { htmlToPdf } from "../reports/pdf";
import { footerHtml, reportHtml, type ReportData } from "../reports/template";
import { caseFor, makersOf } from "./cases";

export const reportsRouter = Router();
export const verifyRouter = Router();

const APPROVER = requireRole("APPROVER");
const CASE_USERS = requireRole("ENGINEER", "APPROVER");

export async function buildReportData(c: any, reportNo: string, verifyId: string, signedAt: Date, approverId: string): Promise<ReportData> {
  const pack = await packById(String(c.rulepack));
  const obj = c.toObject ? c.toObject() : c;
  const verifyUrl = `${config.publicWebUrl.replace(/\/$/, "")}/verify/${verifyId}`;
  const sessions = await TestSession.find({ case: c._id }).sort({ date: 1 }).lean();
  const wIds = [...new Set(sessions.flatMap((s) => (s.weightsUsed ?? []).map(String)))];
  const eIds = [...new Set(sessions.flatMap((s) => (s.equipmentUsed ?? []).map(String)))];
  const atts = await Attachment.find({ case: c._id }).sort({ createdAt: 1 }).lean();
  return {
    lab: await Lab.findOne().lean(),
    c: obj,
    pack,
    validation: validateInstrument(toProfile(obj), pack),
    sessions,
    weights: await Weight.find({ _id: { $in: wIds } }).lean(),
    equipment: await Equipment.find({ _id: { $in: eIds } }).lean(),
    attachments: atts.map((a) => ({
      category: a.category, filename: a.filename ?? "", caption: a.caption ?? undefined, sha256: a.sha256 ?? "",
      dataUrl: a.mime?.startsWith("image/") && a.path && fs.existsSync(a.path) ? `data:${a.mime};base64,${fs.readFileSync(a.path).toString("base64")}` : undefined,
    })),
    reportNo,
    verifyId,
    verifyUrl,
    qrDataUrl: await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }),
    signedAt,
    keyId: verifyId === "draft" ? undefined : labKeyId(),
    people: {
      engineer: await User.findById(c.assignedEngineer).select("name designation").lean(),
      reviewer: c.reviewedBy ? await User.findById(c.reviewedBy).select("name designation").lean() : undefined,
      approver: await User.findById(approverId).select("name designation").lean(),
    },
  };
}

/**
 * Sign & lock (APPROVER): recompute, render the PDF with a QR seal and footer on every page,
 * hash the FINAL PDF bytes, store the report and lock the case.
 */
reportsRouter.post("/cases/:id/sign", requireAuth, APPROVER, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  if (c.status !== "APPROVED") throw conflict("Only approved cases can be signed");
  const makers = await makersOf(c._id, c.assignedEngineer);
  if (makers.has(req.user!.id)) throw forbidden("You entered readings for this case, so you cannot sign it");
  const out = await signCase(c, req.user!.id);
  await audit(req, "CASE_SIGNED", "Report", out.reportId, { reportNo: out.reportNo, sha256: out.sha256, verifyId: out.verifyId }, c._id);
  res.json({ ok: true, ...out });
}));

/** Render, seal, hash and store the report; lock the case. Used by the route and the seed. */
export async function signCase(c: any, approverId: string, signedAt = new Date()) {
  const chain = await verifyChain(c._id);
  if (!chain.ok) throw conflict("Recorded data for this case appears to have been altered, so it cannot be signed. Contact the administrator.");
  await recompute(c);
  const verifyId = randomId(12);
  const count = await Report.countDocuments();
  const reportNo = `TR/${signedAt.getFullYear()}/${String(count + 1).padStart(4, "0")}`;
  const previous = c.report ? await Report.findById(c.report) : null;
  const data = await buildReportData(c, reportNo, verifyId, signedAt, approverId);
  if (previous) data.revisionOf = { reportNo: previous.reportNo, revision: c.revision ?? 1, reason: previous.revisionReason ?? "" };
  const pdf = await htmlToPdf(reportHtml(data), footerHtml(reportNo));
  const docx = await reportDocx(data);
  const dir = path.join(config.storageDir, "reports");
  fs.mkdirSync(dir, { recursive: true });
  const base = reportNo.replace(/\//g, "-");
  const pdfPath = path.join(dir, `${base}.pdf`);
  const docxPath = path.join(dir, `${base}.docx`);
  fs.writeFileSync(pdfPath, pdf);
  fs.writeFileSync(docxPath, docx);
  const hash = sha256(pdf);
  const keyId = labKeyId();
  const signature = signStatement(statementFor({ reportNo, verifyId, sha256: hash, signedAt, keyId }));

  const i: any = c.instrument ?? {};
  const report = await Report.create({
    case: c._id, reportNo, verifyId, pdfPath, docxPath, sha256: hash, signature, keyId, signedBy: approverId, signedAt,
    revision: c.revision ?? 0, supersedes: previous?._id,
    summary: {
      reportNo, caseNo: c.caseNo, applicationNo: c.applicationNo ?? null, manufacturer: c.manufacturer?.name ?? null,
      instrumentType: i.type ?? null, model: i.model ?? null, serialNo: i.serialNo ?? null, cls: data.validation.classDisplay,
      max_g: i.max_g ?? null, e_g: i.e_g ?? null, verdict: c.verdict, profile: c.profile, rulepack: `${data.pack.id} v${data.pack.version}`,
      lab: data.lab?.name ?? null, signedAt: signedAt.toISOString(),
    },
  });
  if (previous) {
    previous.supersededBy = report._id;
    previous.supersededAt = signedAt;
    previous.underRevision = false;
    await previous.save();
  }
  c.status = "SIGNED";
  c.locked = true;
  c.signedAt = signedAt;
  c.signedBy = approverId;
  c.report = report._id;
  await c.save();
  return { reportId: String(report._id), reportNo, verifyId, sha256: hash, revision: c.revision ?? 0, supersedes: previous?.reportNo ?? null };
}

/** Signed reports repository (search). Engineers see their own cases' reports. */
reportsRouter.get("/reports", requireAuth, CASE_USERS, ah(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const filter: any = {};
  if (req.user!.role === "ENGINEER") {
    const mine = await Case.find({ assignedEngineer: req.user!.id }).select("_id").lean();
    filter.case = { $in: mine.map((m) => m._id) };
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (q) {
    const rx = new RegExp(esc(q), "i");
    filter.$or = [{ reportNo: rx }, { "summary.model": rx }, { "summary.serialNo": rx }, { "summary.manufacturer": rx }, { "summary.caseNo": rx }, { "summary.applicationNo": rx }, { "summary.instrumentType": rx }];
  }
  // Instrument-wise history: every report (all revisions) for one model of one manufacturer.
  if (req.query.model) filter["summary.model"] = new RegExp(`^${esc(String(req.query.model))}$`, "i");
  if (req.query.manufacturer) filter["summary.manufacturer"] = new RegExp(`^${esc(String(req.query.manufacturer))}$`, "i");
  if (req.query.verdict) filter["summary.verdict"] = req.query.verdict;
  if (req.query.from || req.query.to) filter.signedAt = { ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}), ...(req.query.to ? { $lte: new Date(String(req.query.to) + "T23:59:59") } : {}) };
  if (req.query.current === "1") filter.supersededBy = { $exists: false };
  const items = await Report.find(filter).populate("signedBy", "name").populate("supersededBy", "reportNo").populate("supersedes", "reportNo").sort({ signedAt: -1 }).limit(500).lean();
  res.json(items.map((r) => ({ ...r, id: String(r._id), pdfPath: undefined, docxPath: undefined })));
}));

async function reportFor(req: any, id: string) {
  const r = await Report.findById(id);
  if (!r) throw notFound("Report");
  await caseFor(req, String(r.case)); // same access rule as the case
  return r;
}

reportsRouter.get("/reports/:id/pdf", requireAuth, CASE_USERS, ah(async (req, res) => {
  const r = await reportFor(req, req.params.id);
  if (!r.pdfPath || !fs.existsSync(r.pdfPath)) throw notFound("PDF");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${r.reportNo.replace(/\//g, "-")}.pdf"`);
  fs.createReadStream(r.pdfPath).pipe(res);
}));

reportsRouter.get("/reports/:id/docx", requireAuth, CASE_USERS, ah(async (req, res) => {
  const r = await reportFor(req, req.params.id);
  if (!r.docxPath || !fs.existsSync(r.docxPath)) throw notFound("DOCX");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${r.reportNo.replace(/\//g, "-")}.docx"`);
  fs.createReadStream(r.docxPath).pipe(res);
}));

/** Preview of the report HTML for any case (approver review screen, engineer preview). Not sealed. */
reportsRouter.get("/cases/:id/preview", requireAuth, CASE_USERS, ah(async (req, res) => {
  const c = await caseFor(req, req.params.id);
  const data = await buildReportData(c, "DRAFT — NOT A REPORT", "draft", new Date(), String(c.approvedBy ?? req.user!.id));
  data.qrDataUrl = await QRCode.toDataURL("DRAFT - not signed", { margin: 1, width: 200 });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(reportHtml(data).replace("<body>", `<body><div style="position:fixed;top:40%;left:10%;font-size:80px;color:rgba(220,38,38,.12);transform:rotate(-25deg);z-index:0;pointer-events:none">DRAFT</div>`));
}));

reportsRouter.post("/reports/:id/revoke", requireAuth, APPROVER, ah(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(5) }), req.body);
  const r = await reportFor(req, req.params.id);
  if (r.revoked) throw conflict("Report already revoked");
  r.revoked = true;
  r.revokedAt = new Date();
  r.revokeReason = reason;
  r.revokedBy = req.user!.id as any;
  await r.save();
  await audit(req, "REPORT_REVOKED", "Report", String(r._id), { reportNo: r.reportNo, reason }, r.case);
  res.json({ ok: true });
}));

// ---------- Public verification (no auth, rate-limited) ----------
const verifyLimiter = rateLimit({ windowMs: 60 * 1000, limit: config.isTest ? 1000 : 30, standardHeaders: true, legacyHeaders: false });
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** Summary only: never readings, never names of people. */
async function publicSummary(r: any) {
  const s = r.summary ?? {};
  const newer = r.supersededBy ? await Report.findById(r.supersededBy).select("reportNo verifyId signedAt").lean() : null;
  const older = r.supersedes ? await Report.findById(r.supersedes).select("reportNo").lean() : null;
  return {
    status: r.revoked ? "REVOKED" : newer ? "SUPERSEDED" : "VALID",
    revision: r.revision ?? 0,
    supersedes: older?.reportNo ?? undefined,
    supersededBy: newer ? { reportNo: newer.reportNo, verifyId: newer.verifyId, signedAt: newer.signedAt } : undefined,
    underRevision: !newer && !r.revoked && r.underRevision ? true : undefined,
    reportNo: r.reportNo,
    signedAt: r.signedAt,
    lab: s.lab,
    manufacturer: s.manufacturer,
    instrumentType: s.instrumentType,
    model: s.model,
    accuracyClass: s.cls,
    max_g: s.max_g,
    e_g: s.e_g,
    verdict: s.verdict,
    basis: s.rulepack,
    sha256: r.sha256,
    signature: r.signature ? { algorithm: SIG_ALG, keyId: r.keyId, valid: verifyStatement(statementFor(r), r.signature) } : null,
    revokedAt: r.revoked ? r.revokedAt : undefined,
    revokeReason: r.revoked ? r.revokeReason : undefined,
  };
}

/** The lab's public key, so anyone can check a report's signature without trusting this website. */
verifyRouter.get("/public-key", verifyLimiter, (_req, res) => {
  res.json({ algorithm: SIG_ALG, keyId: labKeyId(), publicKeyPem: labPublicKeyPem() });
});

/** Everything needed to check the signature offline: the signed statement, the signature and the key. */
verifyRouter.get("/:verifyId/signature", verifyLimiter, ah(async (req, res) => {
  const r = await Report.findOne({ verifyId: req.params.verifyId }).lean();
  if (!r?.signature) return res.status(404).json({ status: "NOT_FOUND" });
  res.setHeader("Content-Disposition", `attachment; filename="${r.reportNo.replace(/\//g, "-")}.signature.json"`);
  res.json({
    algorithm: SIG_ALG, statement: statementFor(r as any), signature: r.signature, publicKeyPem: labPublicKeyPem(),
    howToCheck: "Ed25519-verify the signature over the statement written as canonical JSON (keys sorted, no spaces); then check that the SHA-256 of your PDF equals statement.pdfSha256.",
  });
}));

verifyRouter.get("/:verifyId", verifyLimiter, ah(async (req, res) => {
  const r = await Report.findOne({ verifyId: req.params.verifyId }).lean();
  if (!r) return res.status(404).json({ status: "NOT_FOUND" });
  res.json(await publicSummary(r));
}));

verifyRouter.post("/:verifyId/file", verifyLimiter, pdfUpload.single("file"), ah(async (req, res) => {
  const r = await Report.findOne({ verifyId: req.params.verifyId }).lean();
  if (!r) return res.status(404).json({ status: "NOT_FOUND" });
  if (!req.file) throw bad("Upload the PDF file");
  const h = sha256(req.file.buffer);
  const match = h === r.sha256;
  await audit(null, "REPORT_VERIFY_UPLOAD", "Report", String(r._id), { match });
  const sum = await publicSummary(r);
  res.json({ ...sum, uploadedSha256: h, match, result: match ? (r.revoked ? "REVOKED" : sum.supersededBy ? "SUPERSEDED" : "AUTHENTIC") : "MODIFIED" });
}));
