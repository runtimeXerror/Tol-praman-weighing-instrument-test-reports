"use client";

import { BookOpenCheck, CheckCircle2, FileJson, FlaskConical, Power, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Dialog, EmptyState, td, th, TableWrap } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function RulePacks() {
  const q = useApi<any[]>("/admin/rulepacks");
  const [view, setView] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [upload, setUpload] = useState<{ raw: any; check: any } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const check = await api("/admin/rulepacks/validate", { body: raw });
      setUpload({ raw, check });
    } catch (e) { toast.error(e instanceof SyntaxError ? "Not valid JSON" : errMsg(e)); }
  };

  return (
    <div>
      <PageHeader back={{ href: "/admin/users", label: "Users & Roles" }} eyebrow="Administration" title="Standard Versions"
        subtitle="All limits, error tables and clauses of OIML R 76 and the LM (General) Rules are kept here as versioned standards. Each case keeps the version it was created with; making a new version active only affects new cases."
        actions={<><input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} /><Button onClick={() => file.current?.click()}><Upload className="h-4 w-4" /> Upload new version</Button></>} />

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(["IN", "OIML"] as const).map((p) => {
          const act = (q.data ?? []).find((x) => x.profile === p && x.active);
          return (
            <Card key={p} className="relative overflow-hidden p-5">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-navy-500/15 to-transparent" />
              <p className="text-muted text-xs font-semibold uppercase tracking-wider">Active · {p === "IN" ? "India profile" : "OIML profile"}</p>
              <p className="mt-1 text-lg font-bold">{p === "IN" ? "🇮🇳 LM (General) Rules 2011, Sch. VII Hdg A" : "OIML R 76-1:2006"}</p>
              {act ? <><p className="text-sm">{act.packId} <Badge tone="navy">v{act.version}</Badge></p></> : <p className="text-fail-600">none active</p>}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="All versions" icon={<BookOpenCheck className="h-4 w-4" />} />
        {(q.data ?? []).length === 0 ? <CardBody><EmptyState title="No standard versions" /></CardBody> : (
          <TableWrap>
            <table className="w-full">
              <thead className="surface-2 border-b border-line"><tr><th className={th}>Standard</th><th className={th}>Profile</th><th className={th}>Version</th><th className={th}>Cases using it</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody>
                {(q.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className={td}><p className="font-medium">{p.packId}</p><p className="text-muted max-w-md truncate text-xs">{p.title}</p></td>
                    <td className={td}><Badge tone={p.profile === "IN" ? "saffron" : "navy"}>{p.profile}</Badge></td>
                    <td className={cn(td, "font-mono text-xs")}>{p.version}{p.builtIn && <span className="text-muted ml-1">(built-in)</span>}</td>
                    <td className={cn(td, "tabular")}>{p.cases}</td>
                    <td className={td}>{p.active ? <Badge tone="pass">Active</Badge> : <Badge tone="slate">Inactive · {date(p.createdAt)}</Badge>}</td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={async () => setView(await api(`/admin/rulepacks/${p.id}`))}><FileJson className="h-3.5 w-3.5" /> View</Button>
                        <Button size="sm" variant="ghost" loading={busy === `i${p.id}`} onClick={async () => { setBusy(`i${p.id}`); try { setImpact(await api(`/admin/rulepacks/${p.id}/impact`, { method: "POST" })); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); } }}><FlaskConical className="h-3.5 w-3.5" /> Impact</Button>
                        {!p.active && <Button size="sm" variant="secondary" loading={busy === `a${p.id}`} onClick={async () => { setBusy(`a${p.id}`); try { await api(`/admin/rulepacks/${p.id}/activate`, { method: "POST" }); toast.success("Activated for new cases"); q.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); } }}><Power className="h-3.5 w-3.5" /> Activate</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Dialog wide open={!!view} onClose={() => setView(null)} title={view ? `${view.packId} v${view.version}` : ""} subtitle="Limits and clauses used for verdicts in this version.">
        {view && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Maximum permissible errors ({view.resolved.mpe_initial_verification.clause})</p>
              <TableWrap className="rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="surface-2"><tr><th className={th}>mpe</th>{view.resolved.accuracy_classes.map((c: any) => <th key={c.id} className={th}>Class {c.display}</th>)}</tr></thead>
                  <tbody>
                    {[0, 1, 2].map((k) => (
                      <tr key={k} className="border-t border-line">
                        <td className={cn(td, "font-semibold")}>± {[0.5, 1, 1.5][k]} e</td>
                        {view.resolved.accuracy_classes.map((c: any) => {
                          const b = view.resolved.mpe_initial_verification.bands[c.id];
                          const lo = k === 0 ? 0 : b[k - 1].m_max_e;
                          return <td key={c.id} className={cn(td, "tabular")}>{lo.toLocaleString("en-IN")} {k === 0 ? "≤" : "<"} m {b[k].m_max_e ? `≤ ${b[k].m_max_e.toLocaleString("en-IN")}` : ""}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Tests and clauses</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{view.resolved.tests.map((t: any) => <p key={t.id} className="text-xs"><b className="font-mono">{t.id}</b> {t.name} <span className="text-muted">· {t.clause}</span></p>)}</div>
            </div>
            <details className="rounded-xl border border-line"><summary className="cursor-pointer px-3 py-2 text-sm font-medium">Technical file (advanced)</summary><pre className="scrollbar-thin max-h-96 overflow-auto p-3 font-mono text-[11px]">{JSON.stringify(view.raw, null, 2)}</pre></details>
          </div>
        )}
      </Dialog>

      <Dialog wide open={!!impact} onClose={() => setImpact(null)} title="Impact check" subtitle={impact ? `Re-running ${impact.pack.packId} v${impact.pack.version} over ${impact.total} signed cases (signed reports are never changed)` : ""}>
        {impact && (
          <div className="space-y-3">
            <div className={cn("rounded-xl p-3 text-sm font-semibold", impact.changed ? "bg-cond-50 text-cond-700" : "bg-pass-50 text-pass-700")}>{impact.changed} of {impact.total} signed cases would change verdict.</div>
            {impact.cases.map((c: any) => (
              <div key={c.caseId} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-mono text-xs font-semibold">{c.caseNo}</span><span>{c.model}</span><span className="ml-auto flex items-center gap-1.5"><VerdictBadge v={c.before} /> → <VerdictBadge v={c.after} /></span></div>
                {c.diffs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.diffs.map((d: any) => <Badge key={d.testId} tone="cond">{d.testId}: {d.before} → {d.after}</Badge>)}</div>}
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog open={!!upload} onClose={() => setUpload(null)} title="Upload new standard version" subtitle="The file is checked for errors before it can be used."
        footer={<><Button variant="secondary" onClick={() => setUpload(null)}>Cancel</Button><Button disabled={!upload?.check?.valid} loading={busy === "up"} onClick={async () => { setBusy("up"); try { await api("/admin/rulepacks", { body: upload!.raw }); toast.success("Uploaded as inactive. Run the impact check, then activate."); setUpload(null); q.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); } }}>Upload as inactive</Button></>}>
        {upload && (upload.check.valid ? (
          <div className="flex gap-3 rounded-xl bg-pass-50 p-3 text-sm text-pass-700"><CheckCircle2 className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Valid: {upload.check.id} v{upload.check.version} ({upload.check.profile})</p><p className="break-all font-mono text-[11px]">Ready to upload</p></div></div>
        ) : (
          <div className="flex gap-3 rounded-xl bg-fail-50 p-3 text-sm text-fail-700"><XCircle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">{upload.check.error}</p>{(upload.check.details ?? []).slice(0, 10).map((d: string) => <p key={d} className="font-mono text-[11px]">{d}</p>)}</div></div>
        ))}
      </Dialog>
    </div>
  );
}
