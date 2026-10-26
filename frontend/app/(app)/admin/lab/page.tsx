"use client";

import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export default function LabProfile() {
  const q = useApi<any>("/admin/lab");
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  if (!f) return <Skeleton className="h-96" />;
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      const { name, nameHi, shortName, address, phone, email, accreditationNo } = f;
      await api("/admin/lab", { method: "PUT", body: { name, nameHi, shortName, address, phone, email, accreditationNo } });
      toast.success("Lab profile saved; it appears on every new report");
      q.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader back={{ href: "/admin/users", label: "Users & Roles" }} eyebrow="Administration" title="Lab Profile" subtitle="Auto-populates the header, footer and verification page of every report." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader title="Laboratory details" icon={<Building2 className="h-4 w-4" />} />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name (English)" className="sm:col-span-2"><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Name (Hindi)" className="sm:col-span-2"><Input value={f.nameHi ?? ""} onChange={(e) => set("nameHi", e.target.value)} /></Field>
            <Field label="Short name"><Input value={f.shortName ?? ""} onChange={(e) => set("shortName", e.target.value)} /></Field>
            <Field label="Accreditation no."><Input value={f.accreditationNo ?? ""} onChange={(e) => set("accreditationNo", e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea className="min-h-20" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="Phone"><Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Button loading={busy} onClick={save}>Save lab profile</Button></div>
          </CardBody>
        </Card>
        <Card className="overflow-hidden xl:sticky xl:top-6 xl:self-start">
          <CardHeader title="Report header preview" />
          <CardBody>
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
              <div className="flex items-start justify-between border-b-[3px] border-saffron-400 pb-3">
                <div>
                  <p className="text-sm font-bold">{f.name}</p>
                  {f.nameHi && <p className="text-xs text-slate-600">{f.nameHi}</p>}
                  <p className="text-[11px] text-slate-500">{f.address}</p>
                  {f.accreditationNo && <p className="text-[11px] text-slate-500">Accreditation: {f.accreditationNo}</p>}
                </div>
                <div className="grid h-16 w-16 place-items-center rounded bg-slate-100 text-[9px] text-slate-500">QR</div>
              </div>
              <p className="mt-3 text-center text-sm font-bold text-navy-600">Type Evaluation Test Report</p>
              <p className="text-center text-xs text-slate-500">प्रकार मूल्यांकन परीक्षण रिपोर्ट</p>
            </div>
            <div className="mt-4 flex justify-center opacity-70"><Logo /></div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
