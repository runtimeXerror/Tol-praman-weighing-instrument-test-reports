import {
  AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { L, bi } from "./i18n";
import { displayE, fmtCell, fmtDate, fmtMass, refSpan, tableGroups, type ReportData } from "./template";

const NAVY = "034597";
const cell = (text: string, opts: { bold?: boolean; fill?: string; color?: string } = {}) =>
  new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 17 })] })],
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
  });

const kv = (rows: Array<[string, string]>) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, fill: "F1F5F9" }), cell(v)] })),
  });

const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) =>
  new Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, color: NAVY, bold: true })] });

const verdictFill: Record<string, string> = { PASS: "DCFCE7", FAIL: "FEE2E2", CONDITIONAL: "FEF3C7" };
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(+v.toPrecision(10)) : v == null ? "" : String(v));

const COLS: Array<[string, string]> = [
  ["position", "Pos."], ["direction", "Dir."], ["phase", "Phase"], ["condition", "Cond."], ["disturbance", "Dist."], ["series", "Series"],
  ["kind", "Kind"], ["mode", "Mode"], ["t_min", "t"], ["T_C", "T"], ["RH_pct", "RH %"], ["tare_g", "Tare"], ["range_g", "Range"], ["pct", "% Max"], ["limit_pct", "Limit %"], ["label", "Item"], ["L", "L"], ["I", "I"], ["dL", "ΔL"], ["I1", "I1"], ["I2", "I2"],
  ["E", "E"], ["E0", "E0"], ["Ec", "Ec"], ["change", "Change"], ["spread", "Spread"], ["mpe", "mpe"], ["limit", "Limit"], ["U", "U"], ["value", "Answer"],
];

function testTable(r: any, e?: number): Array<Table | Paragraph> {
  const rows: any[] = r.rows ?? [];
  if (!rows.length) return [new Paragraph((r.notes ?? []).join(" ") || "No data.")];
  return tableGroups(rows, COLS).flatMap(({ caption, cols, rows: g }) => [
    ...(caption ? [new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: caption, bold: true, size: 17 })] })] : []),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [...cols.map(([, t]) => cell(t, { bold: true, fill: NAVY, color: "FFFFFF" })), cell("Result", { bold: true, fill: NAVY, color: "FFFFFF" })] }),
        ...g.map((x) => {
          const ref = refSpan(x, cols);
          return new TableRow({ children: [...cols.map(([k], j) => cell(ref && j === cols.length - ref ? "Reference" : fmtCell(x[k], k, e))), cell(x.verdict, { bold: true, fill: verdictFill[x.verdict] })] });
        }),
      ],
    }),
  ]);
}

/** Editable Word version of the report (same content as the PDF, without the seal). */
export async function reportDocx(d: ReportData): Promise<Buffer> {
  const { c, pack, validation } = d;
  const i = c.instrument ?? {};
  const results: any[] = c.results ?? [];
  const qr = Buffer.from(d.qrDataUrl.split(",")[1], "base64");

  const children: Array<Paragraph | Table> = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.lab?.name ?? "", bold: true, size: 26 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.lab?.address ?? "", size: 18 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: `${L.title[0]} / ${L.title[1]}`, bold: true, size: 32, color: NAVY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: qr, transformation: { width: 90, height: 90 }, type: "png" })] }),
    kv([[bi("reportNo"), d.reportNo], [bi("caseNo"), c.caseNo], [bi("applicationNo"), c.applicationNo ?? "—"], [bi("date"), fmtDate(d.signedAt)]]),
    h(`1. ${bi("general")}`),
    kv([
      [bi("manufacturer"), `${c.manufacturer?.name ?? ""}, ${c.manufacturer?.address ?? ""}`],
      [bi("type"), i.type ?? ""], [bi("model"), i.model ?? ""], [bi("serial"), i.serialNo ?? "—"],
      [bi("cls"), validation?.classDisplay ?? i.cls], [bi("max"), fmtMass(i.max_g)], [bi("min"), fmtMass(i.min_g)],
      [bi("e"), fmtMass(i.e_g)], [bi("d"), fmtMass(i.d_g)], [bi("n"), n(validation?.n)],
    ]),
    h(`2. ${bi("basis")}`),
    kv([[bi("rulepack"), `${pack.title} (version ${pack.version})`], [bi("decision"), c.decisionRule === "guarded" ? pack.verdict_policy.rules.guarded : pack.verdict_policy.rules.simple]]),
    ...(pack.differences_from_base?.length ? [
      new Paragraph({ children: [new TextRun({ text: `Differences from ${pack.extends === "OIML_R76" ? "OIML R 76-1:2006" : pack.extends ?? "the base standard"}`, bold: true })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ["Topic", "Base standard", "Applied here", "Clause"].map((t) => cell(t, { bold: true, fill: NAVY, color: "FFFFFF" })) }),
          ...pack.differences_from_base.map((x: Record<string, string>) => new TableRow({ children: [cell(x.topic), cell(x.base), cell(x.profile), cell(x.clause)] })),
        ],
      }),
    ] : []),
    h(`3. ${bi("summary")}`),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: ["#", "Test", "Clause", "Result"].map((t) => cell(t, { bold: true, fill: NAVY, color: "FFFFFF" })) }),
        ...results.map((r) => new TableRow({ children: [cell(r.testId), cell(r.name), cell(r.clause), cell(r.verdict, { bold: true, fill: verdictFill[r.verdict] })] })),
      ],
    }),
    h(`4. ${bi("results")}`),
  ];
  for (const r of results.filter((x) => x.verdict !== "NOT_APPLICABLE")) {
    children.push(h(`${r.testId} ${r.name} (${r.clause}): ${r.verdict}`, HeadingLevel.HEADING_3));
    children.push(...testTable(r, displayE(i)));
  }
  children.push(h(`6. ${bi("conclusion")}`));
  children.push(new Paragraph({ children: [new TextRun({ text: `${L[c.verdict as keyof typeof L]?.[0] ?? c.verdict} / ${L[c.verdict as keyof typeof L]?.[1] ?? ""}`, bold: true, size: 24 })] }));
  children.push(h(bi("signatures"), HeadingLevel.HEADING_3));
  children.push(kv([
    [bi("testedBy"), d.people.engineer?.name ?? ""],
    ...(d.people.reviewer ? [[bi("reviewedBy"), d.people.reviewer.name] as [string, string]] : []),
    [bi("approvedBy"), d.people.approver?.name ?? ""],
  ]));
  children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: `Editable copy. The signed PDF with the QR code is the official report (Verification ID ${d.verifyId}).`, italics: true, size: 16, color: "64748B" })] }));

  const doc = new Document({ creator: "TOLPRAMAN", title: d.reportNo, sections: [{ children }] });
  return Packer.toBuffer(doc);
}
