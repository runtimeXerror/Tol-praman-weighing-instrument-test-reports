"use client";

import { ScrollText, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SearchBox } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { td, th, TableWrap } from "@/components/ui/misc";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const tone = (a: string) => (a.includes("FAILED") || a.includes("REVOKED") ? "fail" : a.includes("SIGNED") || a.includes("APPROVED") ? "pass" : a.includes("RETURNED") ? "saffron" : a.includes("LOGIN") || a.includes("LOGOUT") ? "slate" : "navy");

/** "READINGS_SAVED" -> "Readings saved" */
const human = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ");
const ROLE_TEXT: Record<string, string> = { INCHARGE: "Lab In-charge", ENGINEER: "Test Engineer", APPROVER: "Senior Engineer", ADMIN: "Administrator", SYSTEM: "System" };
/** {testId: "T01", seq: 4} -> "Test id: T01 · Seq: 4" (fingerprints and internal ids hidden) */
const details = (d: Record<string, unknown> | undefined) =>
  Object.entries(d ?? {})
    .filter(([k, v]) => v !== null && v !== undefined && !/sha256|hash|verifyId|chainHead/i.test(k))
    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ") || "—";

export default function AuditLogs() {
  const [action, setAction] = useState("");
  const q = useApi<any[]>(`/admin/audit?limit=500${action ? `&action=${action}` : ""}`);
  const chain = useApi<any>("/admin/audit/verify");
  const [s, setS] = useState("");
  const list = (q.data ?? []).filter((a) => !s || JSON.stringify(a).toLowerCase().includes(s.toLowerCase()));
  return (
    <div>
      <PageHeader back={{ href: "/admin/users", label: "Users & Roles" }} eyebrow="Administration" title="Activity Log" subtitle="Every login, data entry, review decision, signature and setting change. Entries are permanent and cannot be edited or deleted." />
      <Card className={cn("mb-5", chain.data && (chain.data.ok ? "ring-1 ring-pass-500/40" : "ring-1 ring-fail-500/40"))}>
        <CardBody className="flex flex-wrap items-center gap-4">
          {chain.data?.ok ? <ShieldCheck className="h-10 w-10 text-pass-600" /> : <ShieldAlert className="h-10 w-10 text-fail-600" />}
          <div className="flex-1">
            <p className="font-semibold">{chain.data ? (chain.data.ok ? "Log intact — no entry has been altered" : `Entry #${chain.data.brokenAt} was altered`) : "Checking…"}</p>
            <p className="text-muted text-sm">{chain.data?.count ?? 0} entries checked</p>
          </div>
          <Button variant="secondary" onClick={chain.reload}>Check again</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Events" icon={<ScrollText className="h-4 w-4" />} actions={<>
          <Select className="h-10 w-52" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {["LOGIN", "LOGIN_FAILED", "CASE_CREATED", "READINGS_SAVED", "CASE_SUBMITTED", "CASE_RETURNED", "CASE_APPROVED", "CASE_SIGNED", "REPORT_REVOKED", "RULEPACK_UPLOADED", "RULEPACK_ACTIVATED", "USER_CREATED", "USER_UPDATED", "REPORT_VERIFY_UPLOAD"].map((a) => <option key={a} value={a}>{human(a)}</option>)}
          </Select>
          <SearchBox value={s} onChange={setS} placeholder="Search events…" />
        </>} />
        <TableWrap>
          <table className="w-full">
            <thead className="surface-2 border-b border-line"><tr><th className={th}>#</th><th className={th}>Time</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Item</th><th className={th}>Details</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a._id} className="border-b border-line last:border-0">
                  <td className={cn(td, "tabular text-muted")}>{a.seq}</td>
                  <td className={cn(td, "text-xs")}>{date(a.at, true)}</td>
                  <td className={td}><p className="text-sm">{a.actorName}</p><p className="text-muted text-[11px]">{ROLE_TEXT[a.role] ?? a.role}</p></td>
                  <td className={td}><Badge tone={tone(a.action)}>{human(a.action)}</Badge></td>
                  <td className={cn(td, "text-muted text-xs")}>{a.entity}</td>
                  <td className={cn(td, "max-w-80 truncate text-xs text-muted")} title={details(a.details)}>{details(a.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
