import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

const { Mixed, ObjectId } = Schema.Types;

export const ROLES = ["INCHARGE", "ENGINEER", "APPROVER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ["DRAFT", "SUBMITTED", "RETURNED", "REVIEWED", "APPROVED", "SIGNED"] as const;
export type CaseStatus = (typeof STATUSES)[number];

const ts = { timestamps: true };

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  designation: String,
  phone: String,
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  /** Set when an admin creates the account or resets the password; cleared when the user sets their own. */
  mustChangePassword: { type: Boolean, default: false },
  passwordChangedAt: Date,
  lastLoginAt: Date,
}, ts);

const LabSchema = new Schema({
  name: { type: String, required: true },
  nameHi: String,
  shortName: String,
  address: String,
  phone: String,
  email: String,
  accreditationNo: String,
  logoPath: String,
  twoLevelApproval: { type: Boolean, default: false },
  decisionRule: { type: String, enum: ["simple", "guarded"], default: "guarded" },
  defaultProfile: { type: String, enum: ["OIML", "IN"], default: "OIML" },
  caseSeq: { type: Number, default: 0 },
}, ts);

const WeightSchema = new Schema({
  code: { type: String, required: true, unique: true },
  nominal_g: { type: Number, required: true },
  class: { type: String, required: true },
  conventional_mass_g: { type: Number, required: true },
  U_g: { type: Number, required: true },
  cal_due: { type: String, required: true },
  certificate: String,
  setName: String,
  active: { type: Boolean, default: true },
}, ts);

const EquipmentSchema = new Schema({
  name: { type: String, required: true },
  kind: { type: String, required: true }, // thermo-hygrometer, barometer, climatic chamber, EMC generator, power supply ...
  make: String,
  serial: String,
  cal_due: { type: String, required: true },
  certificate: String,
  active: { type: Boolean, default: true },
}, ts);

const RulePackSchema = new Schema({
  packId: { type: String, required: true },
  profile: { type: String, enum: ["OIML", "IN"], required: true },
  version: { type: String, required: true },
  title: String,
  raw: { type: Mixed, required: true },
  resolved: { type: Mixed, required: true },
  hash: { type: String, required: true },
  active: { type: Boolean, default: false },
  builtIn: { type: Boolean, default: false },
  uploadedBy: { type: ObjectId, ref: "User" },
  notes: String,
}, { ...ts, minimize: false });
RulePackSchema.index({ packId: 1, version: 1 }, { unique: true });

const InstrumentSchema = new Schema({
  // identification
  type: String, // e.g. "Electronic platform scale"
  model: String,
  serialNo: String,
  softwareVersion: String,
  // metrology (engine InstrumentProfile)
  cls: String,
  max_g: Number,
  min_g: Number,
  e_g: Number,
  d_g: Number,
  ranges: [{ _id: false, max_g: Number, e_g: Number }],
  rangeKind: { type: String, enum: ["multi_interval", "multiple_range"] },
  indication: { type: String, enum: ["digital", "analog", "non_self"], default: "digital" },
  power: { type: String, enum: ["mains", "battery", "external_dc", "vehicle"], default: "mains" },
  electronic: { type: Boolean, default: true },
  directSale: Boolean,
  software: Boolean,
  liableToTilt: { type: Boolean, default: true },
  hasTare: Boolean,
  maxTare_g: Number,
  maxAdditiveTare_g: Number,
  supports: Number,
  receptor: { type: String, enum: ["normal", "special", "rolling"], default: "normal" },
  grading: Boolean,
  tempLow_C: Number,
  tempHigh_C: Number,
  levelIndicator: Boolean,
  tiltSensor: Boolean,
  Unom_V: Number,
  loadCell: String,
  indicator: String,
  receptorSize: String,
}, { _id: false });

const CaseSchema = new Schema({
  caseNo: { type: String, required: true, unique: true },
  applicationNo: { type: String, index: true },
  title: String,
  profile: { type: String, enum: ["OIML", "IN"], required: true },
  rulepack: { type: ObjectId, ref: "RulePack", required: true },
  rulepackVersion: { type: String, required: true },
  rulepackHash: { type: String, required: true },
  decisionRule: { type: String, enum: ["simple", "guarded"], default: "guarded" },
  status: { type: String, enum: STATUSES, default: "DRAFT", index: true },
  /** Unset until the Lab In-charge assigns a test engineer (receipt and assignment may happen as separate steps). */
  assignedEngineer: { type: ObjectId, ref: "User", index: true },
  createdBy: { type: ObjectId, ref: "User", required: true },
  reviewedBy: { type: ObjectId, ref: "User" },
  approvedBy: { type: ObjectId, ref: "User" },
  signedBy: { type: ObjectId, ref: "User" },
  manufacturer: { name: String, address: String, country: String },
  applicant: { name: String, address: String },
  instrument: { type: InstrumentSchema, default: {} },
  testInputs: { type: Mixed, default: {} },
  results: { type: Mixed, default: [] },
  verdict: { type: String, default: "NOT_TESTED" },
  counts: { type: Mixed, default: {} },
  plausibilityFlags: [{ _id: false, testId: String, message: String, at: Date }],
  dueDate: Date,
  priority: { type: String, enum: ["normal", "urgent"], default: "normal" },
  submittedAt: Date,
  returnedAt: Date,
  approvedAt: Date,
  signedAt: Date,
  report: { type: ObjectId, ref: "Report" },
  locked: { type: Boolean, default: false },
  /** Sample receipt, recorded by the Lab In-charge when the instrument arrives. */
  receipt: {
    receivedAt: Date,
    sampleNo: String,
    receivedFrom: String,
    condition: { type: String, enum: ["good", "damaged", "incomplete"], default: "good" },
    notes: String,
  },
  /**
   * Senior engineer's decision per test: { [testId]: { state, by, byName, at, note, inputHash, profileHash, verdict } }.
   * An approval only counts while the test's readings and the instrument profile are unchanged (hashes match).
   */
  testReviews: { type: Mixed, default: {} },
  /** 0 for the first report; +1 each time a signed case is reopened for re-test. */
  revision: { type: Number, default: 0 },
}, { ...ts, minimize: false });
CaseSchema.index({ "instrument.model": "text", "manufacturer.name": "text", applicationNo: "text", caseNo: "text", title: "text" });

const TestSessionSchema = new Schema({
  case: { type: ObjectId, ref: "Case", required: true, index: true },
  testId: String,
  date: { type: Date, default: Date.now },
  T_C: Number,
  RH_pct: Number,
  p_hPa: Number,
  equipmentUsed: [{ type: ObjectId, ref: "Equipment" }],
  weightsUsed: [{ type: ObjectId, ref: "Weight" }],
  notes: String,
  user: { type: ObjectId, ref: "User" },
}, ts);

/** Append-only, hash-chained record of every data entry. */
const ReadingSchema = new Schema({
  case: { type: ObjectId, ref: "Case", required: true, index: true },
  seq: { type: Number, required: true },
  testId: { type: String, required: true },
  values: { type: Mixed, required: true },
  source: { type: String, enum: ["DEVICE", "MANUAL", "MIXED"], default: "MANUAL" },
  capturedAt: { type: Date, required: true },
  user: { type: ObjectId, ref: "User", required: true },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
}, { minimize: false });
ReadingSchema.index({ case: 1, seq: 1 }, { unique: true });

const AttachmentSchema = new Schema({
  case: { type: ObjectId, ref: "Case", required: true, index: true },
  category: { type: String, required: true },
  testId: String,
  filename: String,
  path: String,
  mime: String,
  size: Number,
  sha256: String,
  caption: String,
  uploadedBy: { type: ObjectId, ref: "User" },
}, ts);

const CommentSchema = new Schema({
  case: { type: ObjectId, ref: "Case", required: true, index: true },
  testId: String,
  text: { type: String, required: true },
  author: { type: ObjectId, ref: "User", required: true },
  role: String,
  kind: { type: String, enum: ["comment", "return", "review", "approve"], default: "comment" },
  resolved: { type: Boolean, default: false },
}, ts);

const ReportSchema = new Schema({
  case: { type: ObjectId, ref: "Case", required: true, index: true },
  /** Revision of the case this report was issued for; a revised report supersedes the previous one. */
  revision: { type: Number, default: 0 },
  supersedes: { type: ObjectId, ref: "Report" },
  supersededBy: { type: ObjectId, ref: "Report" },
  supersededAt: Date,
  /** Set when the case is reopened after signing, until the revised report is signed. */
  underRevision: { type: Boolean, default: false },
  revisionReason: String,
  reportNo: { type: String, required: true, unique: true },
  verifyId: { type: String, required: true, unique: true },
  pdfPath: String,
  docxPath: String,
  sha256: { type: String, required: true },
  /** Ed25519 signature over statementFor(report) and the lab key it was made with. */
  signature: String,
  keyId: String,
  signedBy: { type: ObjectId, ref: "User" },
  signedAt: Date,
  revoked: { type: Boolean, default: false },
  revokedAt: Date,
  revokeReason: String,
  revokedBy: { type: ObjectId, ref: "User" },
  summary: { type: Mixed },
}, ts);

const AuditSchema = new Schema({
  seq: { type: Number, required: true, unique: true },
  at: { type: Date, default: Date.now },
  actor: { type: ObjectId, ref: "User" },
  actorName: String,
  role: String,
  action: { type: String, required: true },
  entity: String,
  entityId: String,
  case: { type: ObjectId, ref: "Case", index: true },
  details: Mixed,
  ip: String,
  prevHash: String,
  hash: String,
}, { minimize: false });

export const User = mongoose.model("User", UserSchema);
export const Lab = mongoose.model("Lab", LabSchema);
export const Weight = mongoose.model("Weight", WeightSchema);
export const Equipment = mongoose.model("Equipment", EquipmentSchema);
export const RulePack = mongoose.model("RulePack", RulePackSchema);
export const Case = mongoose.model("Case", CaseSchema);
export const TestSession = mongoose.model("TestSession", TestSessionSchema);
export const Reading = mongoose.model("Reading", ReadingSchema);
export const Attachment = mongoose.model("Attachment", AttachmentSchema);
export const Comment = mongoose.model("Comment", CommentSchema);
export const Report = mongoose.model("Report", ReportSchema);
export const AuditLog = mongoose.model("AuditLog", AuditSchema);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };
export type CaseDoc = InferSchemaType<typeof CaseSchema> & { _id: Types.ObjectId };
