"use client";

import { Activity, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/form";
import { Skeleton, Stat } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function SystemSettings() {
  const lab = useApi<any>("/admin/lab");
  const health = useApi<any>("/dashboard/admin");
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (lab.data) setF({ twoLevelApproval: lab.data.twoLevelApproval, decisionRule: lab.data.decisionRule, defaultProfile: lab.data.defaultProfile }); }, [lab.data]);
  const save = async () => {
    setBusy(true);
    try { await api("/admin/lab", { method: "PUT", body: f }); toast.success("Settings saved"); lab.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const h = health.data;
  return (
    <div>
      <PageHeader back={{ href: "/admin/users", label: "Users & Roles" }} eyebrow="Administration" title="System Settings" subtitle="Workflow and decision-rule policy for the laboratory, and system health." />
      {h && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Users" value={(h.users ?? []).reduce((a: number, u: any) => a + u.active, 0)} hint={(h.users ?? []).map((u: any) => `${u._id[0]}${u._id.slice(1).toLowerCase()} ${u.active}`).join(" · ")} icon={<Activity className="h-5 w-5" />} />
          <Stat label="Signed reports" value={h.reports} tone="pass" />
          <Stat label="Calibration expired" value={h.weightsExpired + h.eqExpired} tone="fail" hint="weights + equipment (blocked)" />
          <Stat label="Calibration due ≤ 30 d" value={h.weightsSoon + h.eqSoon} tone="cond" />
        </div>
      )}
      {!f ? <Skeleton className="h-80" /> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Approval workflow" icon={<Settings2 className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <Switch checked={f.twoLevelApproval} onChange={(x) => setF({ ...f, twoLevelApproval: x })} label="Two-level approval (review, then approval)" description="A second, different senior engineer must approve after review. Maker-checker always applies." />
              <div>
                <p className="mb-2 text-sm font-medium">Decision rule</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    ["guarded", "Guarded (with uncertainty)", "PASS if |Ec| + U ≤ mpe; CONDITIONAL if |Ec| ≤ mpe < |Ec| + U; FAIL if |Ec| > mpe"],
                    ["simple", "Simple acceptance (OIML default)", "PASS if |Ec| ≤ mpe, else FAIL. U is shown for information."],
                  ].map(([id, t, d]) => (
                    <button key={id} onClick={() => setF({ ...f, decisionRule: id })} className={cn("rounded-xl border p-3 text-left transition", f.decisionRule === id ? "border-navy-500 bg-navy-50 ring-2 ring-navy-500/20 dark:bg-navy-900/40" : "border-line hover:bg-navy-50/50")}>
                      <p className="text-sm font-semibold">{t}</p><p className="text-muted mt-0.5 text-xs">{d}</p>
                    </button>
                  ))}
                </div>
                <p className="text-muted mt-2 text-xs">Applies to new cases. Existing cases keep the rule they were created with.</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Default evaluation profile</p>
                <div className="flex gap-2">
                  {[["OIML", "OIML R 76-1:2006"], ["IN", "🇮🇳 LM (General) Rules 2011, Heading A"]].map(([id, t]) => (
                    <button key={id} onClick={() => setF({ ...f, defaultProfile: id })} className={cn("rounded-xl border px-3 py-2 text-sm font-medium", f.defaultProfile === id ? "border-navy-500 bg-navy-50 dark:bg-navy-900/40" : "border-line")}>{t}</button>
                  ))}
                </div>
              </div>
              <Button loading={busy} onClick={save}>Save settings</Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Security" icon={<ShieldCheck className="h-4 w-4" />} />
            <CardBody className="space-y-2.5 text-sm">
              {[
                "Each role can only open its own pages and actions",
                "The person who enters readings can never approve or sign that case",
                "Passwords are stored encrypted; sessions expire automatically and can be ended by the administrator",
                "Readings and the activity log are recorded permanently; any change is detected before signing",
                "Every signed PDF has a digital fingerprint; the public QR check shows no readings or names",
                "Results come from fixed rules (no AI); every verdict shows its clause",
              ].map((t) => <p key={t} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pass-600" />{t}</p>)}
              {h?.activePacks && <div className="border-t border-line pt-3"><p className="text-muted mb-1 text-xs">Active standard versions</p>{h.activePacks.map((p: any) => <p key={p._id} className="text-xs"><Badge tone="navy">{p.profile}</Badge> {p.packId} v{p.version}</p>)}</div>}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
