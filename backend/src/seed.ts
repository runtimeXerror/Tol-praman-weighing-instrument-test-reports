import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hashPassword } from "./auth";
import { config } from "./config";
import { connectDb, disconnectDb } from "./db";
import { demoInputs } from "./demo";
import { audit } from "./lib/audit";
import { appendReading, recompute, toProfile } from "./lib/compute";
import { sha256 } from "./lib/hash";
import { activePack, ensureBuiltInPacks, packById } from "./lib/packs";
import { approvalFor, reviewView, setReview } from "./lib/review";
import { Attachment, Case, Comment, Equipment, Lab, TestSession, User, Weight } from "./models";
import { closeBrowser } from "./reports/pdf";

export const DEMO_USERS = [
  { name: "Suresh Nair", email: "incharge@tolpraman.demo", role: "INCHARGE", designation: "Lab In-charge (Deputy Director)", password: "Incharge@123" },
  { name: "Ravi Kumar", email: "engineer@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Priya Sharma", email: "engineer2@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Arjun Mehta", email: "engineer3@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Kavita Reddy", email: "engineer4@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Sanjay Gupta", email: "engineer5@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Neha Joshi", email: "engineer6@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Vikram Singh", email: "engineer7@tolpraman.demo", role: "ENGINEER", designation: "Test Engineer", password: "Engineer@123" },
  { name: "Dr. Anil Verma", email: "approver@tolpraman.demo", role: "APPROVER", designation: "Senior Engineer (Scientist-C)", password: "Approver@123" },
  { name: "Meena Iyer", email: "approver2@tolpraman.demo", role: "APPROVER", designation: "Senior Engineer (Scientist-B)", password: "Approver@123" },
  { name: "System Admin", email: "admin@tolpraman.demo", role: "ADMIN", designation: "Lab IT Administrator", password: "Admin@123" },
] as const;

const day = (n: number) => new Date(Date.now() + n * 86400000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Standard weights set with certificate data. One weight is deliberately expired (blocked everywhere). */
function weightSet() {
  const due = iso(day(200));
  const W: any[] = [];
  const add = (code: string, nominal_g: number, cls: string, dev_mg: number, U_mg: number, cal_due = due) =>
    W.push({ code, nominal_g, class: cls, conventional_mass_g: +(nominal_g + dev_mg / 1000).toFixed(6), U_g: U_mg / 1000, cal_due, certificate: `NPL/CAL/2026/${code}`, setName: cls.startsWith("M") ? "M1 heavy set" : cls === "F1" ? "F1 set" : "E2 set" });
  // M1 heavy weights (20 kg x 3, 10 kg x 2, 5 kg x 2)
  add("M1-20K-1", 20000, "M1", 120, 160); add("M1-20K-2", 20000, "M1", -80, 160); add("M1-20K-3", 20000, "M1", 60, 160);
  add("M1-10K-1", 10000, "M1", 40, 80); add("M1-10K-2", 10000, "M1", -30, 80);
  add("M1-5K-1", 5000, "M1", 20, 40); add("M1-5K-2", 5000, "M1", -10, 40);
  // F1 set 2 kg .. 1 g
  const f1: Array<[number, number, number]> = [[2000, 3, 3], [2000, -2, 3], [1000, 1.5, 1.6], [500, 0.8, 0.8], [200, 0.3, 0.3], [200, -0.2, 0.3], [100, 0.2, 0.16], [50, 0.1, 0.1], [20, 0.05, 0.08], [20, -0.04, 0.08], [10, 0.03, 0.06], [5, 0.02, 0.05], [2, 0.01, 0.04], [2, -0.01, 0.04], [1, 0.01, 0.03]];
  f1.forEach(([n, d, u], k) => add(`F1-${n}G-${k + 1}`, n, "F1", d, u));
  // E2 small weights for changeover (0.1 e steps) and class I/II work
  const e2: Array<[number, number, number]> = [[200, 0.05, 0.1], [100, 0.03, 0.05], [50, 0.02, 0.03], [20, 0.01, 0.025], [10, 0.008, 0.02], [5, 0.005, 0.016], [2, 0.004, 0.012], [1, 0.003, 0.01], [0.5, 0.002, 0.008], [0.2, 0.001, 0.006], [0.1, 0.001, 0.005], [0.05, 0.0005, 0.004], [0.02, 0.0005, 0.003], [0.01, 0.0003, 0.003], [0.005, 0.0002, 0.002], [0.002, 0.0002, 0.002], [0.001, 0.0001, 0.002]];
  e2.forEach(([n, d, u], k) => add(`E2-${n}G-${k + 1}`, n, "E2", d, u));
  // Expired weight: shows the calibration block
  add("M1-20K-X", 20000, "M1", 200, 160, iso(day(-12)));
  return W;
}

const equipmentSet = () => [
  { name: "Thermo-hygrometer TH-01", kind: "Thermo-hygrometer", make: "Testo 608-H1", serial: "TH-5521", cal_due: iso(day(150)), certificate: "CAL/TH/2026/118" },
  { name: "Digital barometer BR-01", kind: "Barometer", make: "Vaisala PTB110", serial: "BR-2210", cal_due: iso(day(20)), certificate: "CAL/BR/2026/042" },
  { name: "Climatic chamber CC-01", kind: "Climatic chamber", make: "Weiss WK-340", serial: "CC-0098", cal_due: iso(day(240)), certificate: "CAL/CC/2026/007" },
  { name: "Programmable AC source PS-01", kind: "AC power source", make: "Chroma 61602", serial: "PS-7781", cal_due: iso(day(300)), certificate: "CAL/PS/2026/019" },
  { name: "ESD simulator ESD-01", kind: "EMC generator", make: "Teseq NSG 438", serial: "ESD-3345", cal_due: iso(day(90)), certificate: "CAL/EMC/2026/033" },
  { name: "Burst / surge generator EFT-01", kind: "EMC generator", make: "EM Test UCS 500", serial: "EFT-1182", cal_due: iso(day(-5)), certificate: "CAL/EMC/2025/210" },
];

const MFR = { name: "XYZ Weighing Systems Pvt. Ltd.", address: "Plot 14, Industrial Area Phase II, Ahmedabad, Gujarat 380 015", country: "India" };

interface DemoCase {
  key: string; title: string; engineer: number; profile?: "OIML" | "IN"; status: string; ageDays: number; applicationNo: string;
  manufacturer?: any; instrument: any; seed: number; quality?: number; overrides?: Record<number, number>; partial?: string[];
  returnComment?: string; sign?: boolean; approve?: boolean; failTest?: { id: string; mutate: (inp: any) => void };
}

const CASES: DemoCase[] = [
  {
    key: "XYZ-30", title: "XYZ-30 electronic counter scale, class III, 30 kg", engineer: 0, status: "DRAFT", ageDays: 3, applicationNo: "MA/2026/GJ/0412", seed: 30,
    instrument: { type: "Electronic self-indicating counter scale", model: "XYZ-30", serialNo: "XYZ30-26-00117", softwareVersion: "v2.4.1", cls: "III", max_g: 30000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains", electronic: true, directSale: true, software: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 15000, supports: 1, receptor: "normal", tempLow_C: -10, tempHigh_C: 40, Unom_V: 230, loadCell: "Single point, OIML R60 C3 (cert. R60/2019-NL1-19.21)", indicator: "XYZ-IND-6", receptorSize: "350 x 300 mm" },
    overrides: { 10000: 4.3, 30000: 10.5 },
  },
  {
    key: "PS-150", title: "PS-150 platform scale, class III, 150 kg", engineer: 0, status: "SIGNED", ageDays: 70, applicationNo: "MA/2026/GJ/0288", seed: 150, sign: true,
    instrument: { type: "Electronic platform scale", model: "PS-150", serialNo: "PS150-26-0042", softwareVersion: "v1.8", cls: "III", max_g: 150000, min_g: 1000, e_g: 50, d_g: 50, indication: "digital", power: "mains", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 75000, supports: 4, tempLow_C: -10, tempHigh_C: 40, Unom_V: 230 },
  },
  {
    key: "PB-600", title: "PB-600 precision balance, class II, 600 g", engineer: 1, status: "SIGNED", ageDays: 48, applicationNo: "MA/2026/MH/0197", seed: 600, sign: true,
    manufacturer: { name: "Precisa Instruments India LLP", address: "Unit 7, MIDC Bhosari, Pune, Maharashtra 411 026", country: "India" },
    instrument: { type: "Electronic precision balance", model: "PB-600", serialNo: "PB6-26-1180", softwareVersion: "3.02", cls: "II", max_g: 600, min_g: 0.5, e_g: 0.01, d_g: 0.01, indication: "digital", power: "external_dc", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 600, supports: 1, tempLow_C: 10, tempHigh_C: 30, Unom_V: 12 },
  },
  {
    key: "MI-15", title: "MI-15 multi-interval retail scale, class III, 6/15 kg", engineer: 1, status: "SUBMITTED", ageDays: 9, applicationNo: "MA/2026/KA/0350", seed: 15, quality: 0.3,
    manufacturer: { name: "Sunrise Scales Co.", address: "No. 22, Peenya 2nd Stage, Bengaluru, Karnataka 560 058", country: "India" },
    instrument: { type: "Electronic price-computing retail scale", model: "MI-15", serialNo: "MI15-26-0931", softwareVersion: "5.1.0", cls: "III", max_g: 15000, min_g: 40, e_g: 2, d_g: 2, ranges: [{ max_g: 6000, e_g: 2 }, { max_g: 15000, e_g: 5 }], rangeKind: "multi_interval", indication: "digital", power: "mains", electronic: true, directSale: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 5998, supports: 1, tempLow_C: -10, tempHigh_C: 40, Unom_V: 230 },
    overrides: { 4000: 1.8 },
  },
  {
    key: "WB-60", title: "WB-60 pit-less weighbridge, class III, 60 t", engineer: 0, status: "APPROVED", ageDays: 21, applicationNo: "MA/2026/RJ/0122", seed: 60, approve: true,
    manufacturer: { name: "Bharat Weighbridges Ltd.", address: "RIICO Industrial Area, Jaipur, Rajasthan 302 022", country: "India" },
    instrument: { type: "Electronic road weighbridge", model: "WB-60", serialNo: "WB60-26-0007", softwareVersion: "2.0", cls: "III", max_g: 60000000, min_g: 400000, e_g: 20000, d_g: 20000, indication: "digital", power: "mains", electronic: true, liableToTilt: false, hasTare: false, supports: 8, receptor: "rolling", tempLow_C: -10, tempHigh_C: 55, Unom_V: 230 },
  },
  {
    key: "AB-220", title: "AB-220 analytical balance, class I, 220 g", engineer: 1, status: "DRAFT", ageDays: 1, applicationNo: "MA/2026/DL/0501", seed: 220,
    partial: ["T01", "T17"],
    manufacturer: { name: "Precisa Instruments India LLP", address: "Unit 7, MIDC Bhosari, Pune, Maharashtra 411 026", country: "India" },
    instrument: { type: "Electronic analytical balance", model: "AB-220", serialNo: "AB2-26-0077", softwareVersion: "4.10", cls: "I", max_g: 220, min_g: 0.01, e_g: 0.001, d_g: 0.0001, indication: "digital", power: "external_dc", electronic: true, liableToTilt: false, levelIndicator: true, hasTare: true, maxTare_g: 220, supports: 1, tempLow_C: 15, tempHigh_C: 30, Unom_V: 12 },
  },
  {
    key: "HS-50", title: "HS-50 hanging scale, class IV, 50 kg", engineer: 0, status: "RETURNED", ageDays: 14, applicationNo: "MA/2026/UP/0233", seed: 50,
    returnComment: "T03 eccentricity: positions are not marked on the sketch. Please attach the test set-up photograph and re-check position 3.",
    manufacturer: { name: "Kanpur Scale Works", address: "Dada Nagar Industrial Estate, Kanpur, Uttar Pradesh 208 022", country: "India" },
    instrument: { type: "Electronic hanging (crane) scale", model: "HS-50", serialNo: "HS50-26-0419", softwareVersion: "1.1", cls: "IIII", max_g: 50000, min_g: 500, e_g: 50, d_g: 50, indication: "digital", power: "battery", electronic: true, liableToTilt: false, hasTare: true, maxTare_g: 25000, supports: 1, tempLow_C: -10, tempHigh_C: 40, Unom_V: 6 },
  },
  {
    key: "BS-300", title: "BS-300 bench scale, class III, 300 kg", engineer: 1, status: "SIGNED", ageDays: 110, applicationNo: "MA/2026/TN/0061", seed: 300, sign: true,
    manufacturer: { name: "Chennai Precision Weighing", address: "SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu 600 032", country: "India" },
    instrument: { type: "Electronic bench scale", model: "BS-300", serialNo: "BS3-26-0151", softwareVersion: "2.2", cls: "III", max_g: 300000, min_g: 2000, e_g: 100, d_g: 100, indication: "digital", power: "mains", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 150000, supports: 4, tempLow_C: -10, tempHigh_C: 40, Unom_V: 230 },
    failTest: { id: "T03", mutate: (inp) => { const r = inp.rows[2]; r.I = r.I + 300; } },
  },
  {
    key: "CS-15", title: "CS-15 compact bench scale, class III, 15 kg", engineer: 0, status: "SUBMITTED", ageDays: 5, applicationNo: "MA/2026/MP/0441", seed: 1515,
    manufacturer: { name: "Indore Scale Industries", address: "Sector E, Sanwer Road Industrial Area, Indore, Madhya Pradesh 452 015", country: "India" },
    instrument: { type: "Electronic bench scale", model: "CS-15", serialNo: "CS15-26-0210", softwareVersion: "1.4", cls: "III", max_g: 15000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 7500, supports: 1, tempLow_C: -10, tempHigh_C: 40, Unom_V: 230 },
  },
  {
    key: "PL-600", title: "PL-600 platform scale, class III, 600 kg", engineer: 0, status: "RETURNED", ageDays: 11, applicationNo: "MA/2026/PB/0318", seed: 600600,
    returnComment: "T09 tilting: the no-load readings for 'left' and 'right' look swapped. Please re-check and attach the level indicator photo.",
    manufacturer: { name: "Punjab Weighing Works", address: "Focal Point Phase VIII, Ludhiana, Punjab 141 010", country: "India" },
    instrument: { type: "Electronic platform scale", model: "PL-600", serialNo: "PL6-26-0088", softwareVersion: "3.0", cls: "III", max_g: 600000, min_g: 4000, e_g: 200, d_g: 200, indication: "digital", power: "mains", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 300000, supports: 4, tempLow_C: -10, tempHigh_C: 40, Unom_V: 230 },
  },
  {
    key: "JB-3", title: "JB-3 jewellery balance, class II, 3 kg", engineer: 0, status: "DRAFT", ageDays: 2, applicationNo: "MA/2026/RJ/0512", seed: 3003,
    partial: ["T01", "T02", "T03", "T17"],
    manufacturer: { name: "Jaipur Precision Balances", address: "Sitapura Industrial Area, Jaipur, Rajasthan 302 022", country: "India" },
    instrument: { type: "Electronic jewellery balance", model: "JB-3", serialNo: "JB3-26-0401", softwareVersion: "2.1", cls: "II", max_g: 3000, min_g: 5, e_g: 0.1, d_g: 0.1, indication: "digital", power: "external_dc", electronic: true, directSale: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 3000, supports: 1, tempLow_C: 10, tempHigh_C: 35, Unom_V: 12 },
  },
  {
    key: "BW-20", title: "BW-20 baby weighing scale, class III, 20 kg", engineer: 0, status: "APPROVED", ageDays: 16, applicationNo: "MA/2026/KL/0207", seed: 2020, approve: true,
    manufacturer: { name: "Kerala Medical Scales", address: "KINFRA Industrial Park, Kochi, Kerala 682 030", country: "India" },
    instrument: { type: "Electronic baby weighing scale", model: "BW-20", serialNo: "BW20-26-0055", softwareVersion: "1.2", cls: "III", max_g: 20000, min_g: 200, e_g: 10, d_g: 10, indication: "digital", power: "battery", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 10000, supports: 4, tempLow_C: 10, tempHigh_C: 40, Unom_V: 6 },
  },
  {
    key: "VS-10", title: "VS-10 vegetable vendor scale, class IV, 10 kg", engineer: 0, status: "SIGNED", ageDays: 34, applicationNo: "MA/2026/WB/0099", seed: 1010, sign: true,
    manufacturer: { name: "Kolkata Tula Udyog", address: "Taratala Industrial Estate, Kolkata, West Bengal 700 088", country: "India" },
    instrument: { type: "Electronic vendor scale", model: "VS-10", serialNo: "VS10-26-0301", softwareVersion: "1.0", cls: "IIII", max_g: 10000, min_g: 200, e_g: 20, d_g: 20, indication: "digital", power: "battery", electronic: true, directSale: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 5000, supports: 1, tempLow_C: -10, tempHigh_C: 40, Unom_V: 6 },
  },
  {
    key: "TS-6", title: "TS-6 table-top scale, class II, 6 kg", engineer: 1, status: "SUBMITTED", ageDays: 4, applicationNo: "MA/2026/TG/0388", seed: 6006,
    manufacturer: { name: "Hyderabad Instruments Pvt. Ltd.", address: "IDA Uppal, Hyderabad, Telangana 500 039", country: "India" },
    instrument: { type: "Electronic table-top scale", model: "TS-6", serialNo: "TS6-26-0144", softwareVersion: "2.3", cls: "II", max_g: 6000, min_g: 5, e_g: 0.1, d_g: 0.1, indication: "digital", power: "mains", electronic: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 6000, supports: 1, tempLow_C: 10, tempHigh_C: 35, Unom_V: 230 },
  },
  {
    key: "PC-30", title: "PC-30 price-computing scale, class III, 30 kg", engineer: 1, status: "RETURNED", ageDays: 7, applicationNo: "MA/2026/GJ/0460", seed: 3030,
    returnComment: "Environment record for the damp heat phase is missing. Please add the chamber T/RH log.",
    manufacturer: { name: "XYZ Weighing Systems Pvt. Ltd.", address: "Plot 14, Industrial Area Phase II, Ahmedabad, Gujarat 380 015", country: "India" },
    instrument: { type: "Electronic price-computing scale", model: "PC-30", serialNo: "PC30-26-0612", softwareVersion: "4.0", cls: "III", max_g: 30000, min_g: 100, e_g: 5, d_g: 5, indication: "digital", power: "mains", electronic: true, directSale: true, liableToTilt: true, levelIndicator: true, hasTare: true, maxTare_g: 15000, supports: 1, tempLow_C: -10, tempHigh_C: 40, Unom_V: 230 },
  },
];

/** A realistic-looking photo placeholder rendered with the report browser (nameplate / instrument). */
async function renderImage(kind: "nameplate" | "photo" | "setup", c: any): Promise<Buffer | null> {
  try {
    const i = c.instrument;
    const html = kind === "nameplate"
      ? `<div style="width:640px;height:360px;background:linear-gradient(135deg,#cfd8dc,#eceff1);display:flex;align-items:center;justify-content:center;font-family:Arial">
         <div style="width:560px;border:3px solid #37474f;border-radius:10px;padding:18px;background:#f5f5f5;color:#263238">
         <div style="font-weight:700;font-size:20px">${c.manufacturer?.name ?? ""}</div><div style="font-size:14px;margin:6px 0 10px">${i.type}</div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:15px">
         <div>Model: <b>${i.model}</b></div><div>S/N: <b>${i.serialNo}</b></div><div>Max: <b>${i.max_g >= 1000 ? i.max_g / 1000 + " kg" : i.max_g + " g"}</b></div>
         <div>Min: <b>${i.min_g >= 1000 ? i.min_g / 1000 + " kg" : i.min_g + " g"}</b></div><div>e = <b>${i.e_g >= 1000 ? i.e_g / 1000 + " kg" : i.e_g + " g"}</b></div>
         <div>Class: <b style="border:2px solid #263238;border-radius:50%;padding:0 10px">${i.cls === "IIII" ? "IIII" : i.cls}</b></div><div>${i.Unom_V ?? ""} V</div><div>-10 °C / +40 °C</div></div></div></div>`
      : `<div style="width:640px;height:420px;background:radial-gradient(circle at 30% 20%,#e3f2fd,#90a4ae);display:flex;align-items:flex-end;justify-content:center;font-family:Arial">
         <div style="width:440px;height:${kind === "setup" ? 90 : 60}px;background:#b0bec5;border:4px solid #455a64;border-radius:6px;margin-bottom:${kind === "setup" ? 120 : 90}px;position:relative">
         ${kind === "setup" ? `<div style="position:absolute;left:40px;top:-70px;width:90px;height:70px;background:#546e7a;border-radius:6px"></div><div style="position:absolute;left:170px;top:-50px;width:70px;height:50px;background:#607d8b;border-radius:6px"></div>` : ""}
         <div style="position:absolute;right:-110px;top:-120px;width:120px;height:80px;background:#263238;border-radius:8px;color:#76ff03;font:bold 26px monospace;display:flex;align-items:center;justify-content:center">${kind === "setup" ? "10.000" : "0.000"}</div></div></div>`;
    const puppeteer = (await import("puppeteer")).default;
    const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }).catch(async () => {
      const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => fs.existsSync(p));
      return puppeteer.launch({ headless: true, args: ["--no-sandbox"], executablePath: exe });
    });
    const p = await b.newPage();
    await p.setViewport({ width: 640, height: kind === "nameplate" ? 360 : 420 });
    await p.setContent(`<body style="margin:0">${html}</body>`);
    const buf = Buffer.from(await p.screenshot({ type: "png" }));
    await b.close();
    return buf;
  } catch {
    return null;
  }
}

async function attach(c: any, category: string, caption: string, buf: Buffer, userId: unknown) {
  const dir = path.join(config.storageDir, "attachments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${c.caseNo.replace(/\//g, "-")}-${category.toLowerCase()}.png`);
  fs.writeFileSync(file, buf);
  await Attachment.create({ case: c._id, category, caption, filename: path.basename(file), path: file, mime: "image/png", size: buf.length, sha256: sha256(buf), uploadedBy: userId });
}

const TIME_TESTS: Record<string, number> = { T07b: 31, T11: 31, T07a: 31, T14: 2 * 24 * 60 + 5, T19: 4 * 120 + 5 };

export async function seed({ withReports = true } = {}) {
  await ensureBuiltInPacks();
  if (!(await Lab.exists({}))) await Lab.create({
    name: "Regional Reference Standards Laboratory", nameHi: "क्षेत्रीय निर्देश मानक प्रयोगशाला", shortName: "RRSL",
    twoLevelApproval: false, decisionRule: "guarded", defaultProfile: "OIML", caseSeq: 0,
  });
  const users: any[] = [];
  for (const u of DEMO_USERS) {
    const { password, ...rest } = u;
    const existing = await User.findOne({ email: u.email });
    users.push(existing ?? (await User.create({ ...rest, passwordHash: await hashPassword(password), active: true })));
  }
  const eng = users.filter((u) => u.role === "ENGINEER");
  const [approver, approver2] = users.filter((u) => u.role === "APPROVER");
  const incharge = users.find((u) => u.role === "INCHARGE");
  await upgradeExisting(incharge, approver);
  if (!(await Weight.countDocuments())) await Weight.insertMany(weightSet());
  if (!(await Equipment.countDocuments())) await Equipment.insertMany(equipmentSet());
  const weights = await Weight.find({ cal_due: { $gte: iso(new Date()) } }).lean();
  const equipment = await Equipment.find({ cal_due: { $gte: iso(new Date()) } }).lean();

  const imgs = withReports ? { nameplate: new Map<string, Buffer>(), photo: null as Buffer | null, setup: null as Buffer | null } : null;
  const { signCase } = await import("./routes/reports");

  for (const d of CASES) {
    if (await Case.exists({ title: d.title })) continue;
    const pack = await activePack(d.profile ?? "IN");
    const lab = await Lab.findOneAndUpdate({}, { $inc: { caseSeq: 1 } }, { new: true });
    const created = day(-d.ageDays);
    const caseNo = `TE/${created.getFullYear()}/${String(lab!.caseSeq).padStart(4, "0")}`;
    const c: any = await Case.create({
      caseNo, title: d.title, applicationNo: d.applicationNo, profile: d.profile ?? "IN", rulepack: pack._id, rulepackVersion: pack.version, rulepackHash: pack.hash,
      decisionRule: "guarded", status: "DRAFT", assignedEngineer: eng[d.engineer]._id, createdBy: incharge._id,
      receipt: { receivedAt: created, sampleNo: `S/${created.getFullYear()}/${String(lab!.caseSeq).padStart(4, "0")}`, receivedFrom: (d.manufacturer ?? MFR).name, condition: "good" },
      manufacturer: d.manufacturer ?? MFR, applicant: d.manufacturer ?? MFR, instrument: d.instrument, dueDate: day(-d.ageDays + 30), priority: d.key === "XYZ-30" ? "urgent" : "normal",
    });
    await Case.collection.updateOne({ _id: c._id }, { $set: { createdAt: created } });
    await audit(null, "CASE_CREATED", "Case", String(c._id), { caseNo, seeded: true }, c._id);
    const P = await packById(String(c.rulepack));
    const inputs = demoInputs(toProfile(c.toObject()), P, d.seed, d.quality ?? 0.35, d.overrides ?? {});
    if (d.failTest) d.failTest.mutate(inputs[d.failTest.id]);
    const keep = d.partial ? Object.fromEntries(Object.entries(inputs).filter(([k]) => d.partial!.includes(k))) : inputs;

    let t = created.getTime() + 60 * 60000;
    await appendReading(c, "PROFILE", { instrument: d.instrument }, String(eng[d.engineer]._id), "MANUAL", new Date(t));
    for (const [testId, input] of Object.entries(keep)) {
      t += 7 * 60000;
      const extra = TIME_TESTS[testId];
      if (extra) {
        await appendReading(c, testId, { started: true }, String(eng[d.engineer]._id), "MANUAL", new Date(t));
        t += extra * 60000;
      }
      await appendReading(c, testId, input, String(eng[d.engineer]._id), testId === "T01" ? "DEVICE" : "MANUAL", new Date(t));
    }
    c.testInputs = keep;
    c.markModified("testInputs");
    for (const [k, T, RH, p] of [["T01", 22.4, 48, 1008.6], ["T14", 40.1, 85, 1007.9], ["T02", 20.2, 45, 1009.1]] as const) {
      if (!keep[k]) continue;
      await TestSession.create({ case: c._id, testId: k, date: new Date(created.getTime() + 2 * 3600000), T_C: T, RH_pct: RH, p_hPa: p, equipmentUsed: equipment.slice(0, 2).map((e) => e._id), weightsUsed: weights.filter((w) => w.nominal_g >= 1000).slice(0, 6).map((w) => w._id), user: eng[d.engineer]._id });
    }
    if (imgs && !d.partial) {
      imgs.photo ??= await renderImage("photo", c);
      imgs.setup ??= await renderImage("setup", c);
      const np = await renderImage("nameplate", c);
      if (np) await attach(c, "NAMEPLATE", "Nameplate / descriptive markings", np, eng[d.engineer]._id);
      if (imgs.photo) await attach(c, "INSTRUMENT_PHOTO", "Instrument, front view", imgs.photo, eng[d.engineer]._id);
      if (imgs.setup && d.key !== "HS-50") await attach(c, "TEST_SETUP", "Eccentricity test set-up", imgs.setup, eng[d.engineer]._id);
    }
    await recompute(c);
    await c.save();

    const at = (h: number) => new Date(created.getTime() + h * 3600000);
    if (["SUBMITTED", "RETURNED", "APPROVED", "SIGNED"].includes(d.status)) {
      c.status = "SUBMITTED"; c.submittedAt = at(20); await c.save();
    }
    const reviewer = { id: String(approver._id), name: approver.name };
    if (d.status === "RETURNED") {
      // everything approved except the tests the senior engineer sent back
      const back: Record<string, string> = { "HS-50": "T03", "PL-600": "T09" };
      for (const t of reviewView(c, P)) {
        if (t.testId === back[d.key]) setReview(c, t.testId, { state: "RETURNED", by: reviewer.id, byName: reviewer.name, at: at(30).toISOString(), note: "Please repeat this test" });
        else if (t.current !== "NOT_TESTED") setReview(c, t.testId, approvalFor(c, t.testId, reviewer));
      }
      c.status = "RETURNED"; c.returnedAt = at(30); await c.save();
      await Comment.create({ case: c._id, text: d.returnComment!, author: approver._id, role: "APPROVER", kind: "return" });
      if (d.key === "HS-50") await Comment.create({ case: c._id, testId: "T03", text: "Position 3 result looks inconsistent with positions 1, 2 and 4. Please repeat.", author: approver._id, role: "APPROVER", kind: "return" });
      if (d.key === "PL-600") await Comment.create({ case: c._id, testId: "T09", text: "Re-check left/right no-load readings.", author: approver._id, role: "APPROVER", kind: "return" });
    }
    if (d.approve || d.sign) {
      for (const t of reviewView(c, P)) setReview(c, t.testId, approvalFor(c, t.testId, reviewer, t.current === "PASS" ? undefined : "Result checked and confirmed"));
      c.status = "APPROVED"; c.approvedBy = (d.key === "PB-600" ? approver2 : approver)._id; c.approvedAt = at(40); await c.save();
      await Comment.create({ case: c._id, text: "Checked all tests against the rule pack. Approved.", author: c.approvedBy, role: "APPROVER", kind: "approve" });
    }
    if (d.sign && withReports) {
      await signCase(c, String(c.approvedBy), at(44));
    }
    console.log(`  seeded ${c.caseNo} ${d.key} -> ${c.status} (${c.verdict})`);
  }
  await closeBrowser();
  return { users: DEMO_USERS.map(({ email, password, role }) => ({ email, password, role })) };
}

/**
 * Bring cases created before per-test review and sample receipt existed up to date, without deleting anything:
 * receipt from the creation date; approved / signed cases get every test approved; returned cases get the tests
 * named in open return comments marked RETURNED and the rest approved.
 */
async function upgradeExisting(incharge: any, approver: any) {
  const old = await Case.find({ $or: [{ testReviews: { $exists: false } }, { testReviews: {} }, { receipt: { $exists: false } }] });
  for (const c of old as any[]) {
    if (!c.receipt?.receivedAt) c.receipt = { receivedAt: c.createdAt, receivedFrom: c.manufacturer?.name, condition: "good" };
    const pack = await packById(String(c.rulepack));
    const reviewer = { id: String(c.approvedBy ?? approver._id), name: approver.name };
    if (!Object.keys(c.testReviews ?? {}).length && ["RETURNED", "APPROVED", "SIGNED"].includes(c.status)) {
      const back = new Set((await Comment.find({ case: c._id, kind: "return", resolved: false, testId: { $exists: true } }).lean()).map((x) => x.testId));
      for (const t of reviewView(c, pack)) {
        if (c.status === "RETURNED" && back.has(t.testId)) setReview(c, t.testId, { state: "RETURNED", by: reviewer.id, byName: reviewer.name, at: new Date(c.returnedAt ?? Date.now()).toISOString(), note: "Please repeat this test" });
        else if (t.current !== "NOT_TESTED") setReview(c, t.testId, approvalFor(c, t.testId, reviewer, t.current === "PASS" ? undefined : "Result checked and confirmed"));
      }
    }
    if (!c.testReviews) c.testReviews = {};
    await c.save();
  }
  if (old.length) console.log(`  upgraded ${old.length} existing case(s): receipt + per-test review states`);
  // A test decision can never be later than the case decision it led to (fixes back-filled dates).
  for (const c of (await Case.find({ status: { $in: ["RETURNED", "APPROVED", "SIGNED"] } })) as any[]) {
    const limit = c.status === "RETURNED" ? c.returnedAt : c.approvedAt ?? c.signedAt;
    if (!limit) continue;
    let changed = false;
    const reviews = { ...(c.testReviews ?? {}) };
    for (const [k, r] of Object.entries<any>(reviews)) {
      if (r?.at && new Date(r.at) > new Date(limit)) { reviews[k] = { ...r, at: new Date(limit).toISOString() }; changed = true; }
    }
    if (changed) { c.testReviews = reviews; c.markModified("testReviews"); await c.save(); }
  }
  void incharge;
}

// CLI: npm run seed  (use --reset to wipe the database first)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    await connectDb();
    if (process.argv.includes("--reset")) {
      const mongoose = (await import("mongoose")).default;
      await mongoose.connection.db!.dropDatabase();
      fs.rmSync(config.storageDir, { recursive: true, force: true });
      console.log("Database reset.");
    }
    const r = await seed();
    console.log("\nDemo logins:");
    for (const u of r.users) console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(28)} ${u.password}`);
    await disconnectDb();
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
