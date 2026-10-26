"use client";

import { ExternalLink, FileDown, FileSearch, FileSpreadsheet, FileText, History, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBox } from "../shell/app-shell";
import { Badge, VerdictBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input, Select } from "../ui/form";
import { EmptyState, Skeleton, td, th, TableWrap } from "../ui/misc";
import { download } from "@/lib/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import { date, mass } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function exportList(rows: any[]) {
  const head = ["Report no.", "Case no.", "Application no.", "Manufacturer", "Instrument", "Model", "Serial no.", "Class", "Max (g)", "e (g)", "Verdict", "Status", "Signed on", "Signed by", "Standard", "Verification ID"];
  const body = rows.map((x) => {
    const s = x.summary ?? {};
    return [x.reportNo, s.caseNo, s.applicationNo, s.manufacturer, s.instrumentType, s.model, s.serialNo, s.cls, s.max_g, s.e_g, s.verdict, x.revoked ? "REVOKED" : x.supersededBy ? `SUPERSEDED by ${x.supersededBy.reportNo}` : "VALID",
      date(x.signedAt), x.signedBy?.name, s.profile === "IN" ? "LM (G) Rules 2011, Heading A" : "OIML R 76", x.verifyId];
  });
  downloadCsv(`signed-reports-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(head, body));
}

/** Repository of signed reports: search by model, maker, case, application no., verdict and date. */
export function ReportsTable({ caseHref }: { caseHref?: (caseId: string) => string }) {
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** Instrument-wise history: one model of one manufacturer, every report and revision. */
  const [inst, setInst] = useState<{ model: string; manufacturer: string } | null>(null);
  const qs = useMemo(() => new URLSearchParams(Object.entries({ q, verdict, from, to, model: inst?.model ?? "", manufacturer: inst?.manufacturer ?? "" }).filter(([, v]) => v)).toString(), [q, verdict, from, to, inst]);
  const r = useApi<any[]>(`/reports${qs ? `?${qs}` : ""}`);
  return (
    <Card>
      <CardHeader title={inst ? `Instrument history: ${inst.model}` : "Report repository"} subtitle={r.data ? `${r.data.length} reports${inst ? ` · ${inst.manufacturer}` : ""}` : "Loading…"} icon={inst ? <History className="h-4 w-4" /> : <FileSearch className="h-4 w-4" />}
        actions={<>
          {inst && <Button variant="secondary" onClick={() => setInst(null)} title="Back to all reports"><X className="h-4 w-4" /> All reports</Button>}
          <SearchBox value={q} onChange={setQ} placeholder="Model, serial no., maker, report / case / application no." />
          <Select className="h-10 w-36" value={verdict} onChange={(e) => setVerdict(e.target.value)}><option value="">Any verdict</option><option value="PASS">Pass</option><option value="CONDITIONAL">Conditional</option><option value="FAIL">Fail</option></Select>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} title="Signed from" />
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} title="Signed to" />
          <Button variant="secondary" disabled={!r.data?.length} onClick={() => exportList(r.data ?? [])} title="Download this list as CSV (opens in Excel)"><FileSpreadsheet className="h-4 w-4" /> Export</Button>
        </>} />
      {!r.data ? <div className="p-5"><Skeleton className="h-40" /></div> : r.data.length === 0 ? (
        <div className="p-5"><EmptyState icon={<FileSearch className="h-5 w-5" />} title="No reports found" text="Try a different search or date range." /></div>
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="surface-2 border-b border-line">
              <tr><th className={th}>Report</th><th className={th}>Instrument</th><th className={th}>Manufacturer</th><th className={th}>Verdict</th><th className={th}>Signed</th><th className={th}>Basis</th><th className={cn(th, "text-right")}>Files</th></tr>
            </thead>
            <tbody>
              {r.data.map((x) => (
                <tr key={x.id} className={cn("border-b border-line last:border-0", (x.revoked || x.supersededBy) && "opacity-60")}>
                  <td className={td}>
                    <p className="font-mono text-xs font-semibold">{x.reportNo}{x.revision > 0 && <span className="ml-1.5 rounded bg-violet-600 px-1 font-sans text-[10px] font-bold text-white">REV {x.revision}</span>}</p>
                    {caseHref ? <Link href={caseHref(String(x.case))} className="text-xs text-navy-600 hover:underline dark:text-navy-300">{x.summary?.caseNo}</Link> : <p className="text-muted text-xs">{x.summary?.caseNo}</p>}
                  </td>
                  <td className={td}>
                    <p className="font-medium">{x.summary?.model}</p>
                    <p className="text-muted text-xs">Class {x.summary?.cls} · {mass(x.summary?.max_g)} · e {mass(x.summary?.e_g)}{x.summary?.serialNo ? ` · S/N ${x.summary.serialNo}` : ""}</p>
                    {!inst && x.summary?.model && x.summary?.manufacturer && (
                      <button type="button" onClick={() => setInst({ model: x.summary.model, manufacturer: x.summary.manufacturer })} className="mt-0.5 inline-flex items-center gap-1 text-xs text-navy-600 hover:underline dark:text-navy-300">
                        <History className="h-3 w-3" /> Instrument history
                      </button>
                    )}
                  </td>
                  <td className={cn(td, "max-w-56 truncate")}>{x.summary?.manufacturer}</td>
                  <td className={td}>{x.revoked ? <Badge tone="fail">REVOKED</Badge> : x.supersededBy ? <Badge tone="slate" className="whitespace-normal">Replaced by {x.supersededBy.reportNo}</Badge> : <VerdictBadge v={x.summary?.verdict} />}{x.underRevision && !x.supersededBy && <span className="text-muted mt-1 block text-[11px]">Revision in progress</span>}</td>
                  <td className={td}><p>{date(x.signedAt)}</p><p className="text-muted text-xs">{x.signedBy?.name}</p></td>
                  <td className={cn(td, "text-muted text-xs")}>{x.summary?.profile === "IN" ? "LM (G) Rules 2011" : "OIML R 76"}</td>
                  <td className={cn(td, "text-right")}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Open PDF" onClick={() => download(`/reports/${x.id}/pdf`, "", true)}><FileDown className="h-3.5 w-3.5" /> PDF</Button>
                      <Button size="sm" variant="ghost" title="Download Word" onClick={() => download(`/reports/${x.id}/docx`, `${x.reportNo.replace(/\//g, "-")}.docx`)}><FileText className="h-3.5 w-3.5" /> DOCX</Button>
                      <Button size="sm" variant="ghost" title="Public verification page" onClick={() => window.open(`/verify/${x.verifyId}`, "_blank")}><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
