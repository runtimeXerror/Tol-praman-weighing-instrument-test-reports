"use client";

import { Gauge, Plus, Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SearchBox } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, NumberInput, Select } from "@/components/ui/form";
import { Dialog, Stat, Tabs, td, th, TableWrap } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { mass } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const soon = (d: string) => new Date(d).getTime() - Date.now() < 30 * 86400000;
function Due({ d, expired }: { d: string; expired: boolean }) {
  return expired ? <Badge tone="fail">Expired {d} · blocked</Badge> : soon(d) ? <Badge tone="cond">Due {d}</Badge> : <span className="text-muted text-xs">{d}</span>;
}

export default function EquipmentRegister() {
  const w = useApi<any[]>("/admin/weights");
  const e = useApi<any[]>("/admin/equipment");
  const [tab, setTab] = useState<"weights" | "equipment">("weights");
  const [s, setS] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const isW = tab === "weights";
  const save = async () => {
    setBusy(true);
    try {
      const { id, _id, expired, createdAt, updatedAt, __v, ...body } = edit;
      void _id; void expired; void createdAt; void updatedAt; void __v;
      const base = isW ? "/admin/weights" : "/admin/equipment";
      if (id) await api(`${base}/${id}`, { method: "PUT", body });
      else await api(base, { body });
      toast.success("Saved");
      setEdit(null);
      (isW ? w : e).reload();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const all = (isW ? w.data : e.data) ?? [];
  const list = all.filter((x) => !s || JSON.stringify(x).toLowerCase().includes(s.toLowerCase()));
  const expired = [...(w.data ?? []), ...(e.data ?? [])].filter((x) => x.expired).length;
  const dueSoon = [...(w.data ?? []), ...(e.data ?? [])].filter((x) => !x.expired && soon(x.cal_due)).length;

  return (
    <div>
      <PageHeader back={{ href: "/admin/users", label: "Users & Roles" }} eyebrow="Administration" title="Equipment Register" subtitle="Standard weights (OIML R 111) and test equipment with calibration certificates. Expired items are blocked everywhere: sessions, weight picker and reports."
        actions={<Button onClick={() => setEdit(isW ? { class: "M1", cal_due: "" } : { kind: "", cal_due: "" })}><Plus className="h-4 w-4" /> Add {isW ? "weight" : "equipment"}</Button>} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Stat label="Standard weights" value={w.data?.length ?? "—"} icon={<Scale className="h-5 w-5" />} />
        <Stat label="Test equipment" value={e.data?.length ?? "—"} tone="violet" icon={<Gauge className="h-5 w-5" />} />
        <Stat label="Calibration due ≤ 30 d" value={dueSoon} tone="cond" />
        <Stat label="Expired (blocked)" value={expired} tone="fail" />
      </div>
      <Card>
        <CardHeader title={<Tabs value={tab} onChange={setTab} tabs={[{ id: "weights", label: "Standard weights", count: w.data?.length }, { id: "equipment", label: "Equipment", count: e.data?.length }]} />} actions={<SearchBox value={s} onChange={setS} placeholder="Search…" />} />
        <TableWrap>
          {isW ? (
            <table className="w-full">
              <thead className="surface-2 border-b border-line"><tr><th className={th}>Code</th><th className={th}>Class</th><th className={cn(th, "text-right")}>Nominal</th><th className={cn(th, "text-right")}>Conv. mass (g)</th><th className={cn(th, "text-right")}>U k=2 (mg)</th><th className={th}>Certificate</th><th className={th}>Cal. due</th><th className={th} /></tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className={cn("border-b border-line last:border-0", x.expired && "bg-fail-50/50 dark:bg-fail-700/10")}>
                    <td className={cn(td, "font-mono text-xs font-semibold")}>{x.code}</td>
                    <td className={td}><Badge tone="navy">{x.class}</Badge></td>
                    <td className={cn(td, "tabular text-right")}>{mass(x.nominal_g)}</td>
                    <td className={cn(td, "tabular text-right")}>{x.conventional_mass_g}</td>
                    <td className={cn(td, "tabular text-right")}>{+(x.U_g * 1000).toPrecision(6)}</td>
                    <td className={cn(td, "text-muted text-xs")}>{x.certificate}</td>
                    <td className={td}><Due d={x.cal_due} expired={x.expired} /></td>
                    <td className={cn(td, "text-right")}><Button size="sm" variant="ghost" onClick={() => setEdit(x)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="surface-2 border-b border-line"><tr><th className={th}>Name</th><th className={th}>Kind</th><th className={th}>Make / serial</th><th className={th}>Certificate</th><th className={th}>Cal. due</th><th className={th} /></tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className={cn("border-b border-line last:border-0", x.expired && "bg-fail-50/50 dark:bg-fail-700/10")}>
                    <td className={cn(td, "font-medium")}>{x.name}</td>
                    <td className={td}>{x.kind}</td>
                    <td className={cn(td, "text-muted text-xs")}>{x.make} · {x.serial}</td>
                    <td className={cn(td, "text-muted text-xs")}>{x.certificate}</td>
                    <td className={td}><Due d={x.cal_due} expired={x.expired} /></td>
                    <td className={cn(td, "text-right")}><Button size="sm" variant="ghost" onClick={() => setEdit(x)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableWrap>
      </Card>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={`${edit?.id ? "Edit" : "Add"} ${isW ? "standard weight" : "equipment"}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        {edit && (isW ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code"><Input value={edit.code ?? ""} onChange={(ev) => setEdit({ ...edit, code: ev.target.value })} /></Field>
            <Field label="Class (OIML R 111)"><Select value={edit.class} onChange={(ev) => setEdit({ ...edit, class: ev.target.value })}>{["E1", "E2", "F1", "F2", "M1", "M1-2", "M2", "M2-3", "M3"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Nominal" unit="g"><NumberInput className="h-10" value={edit.nominal_g} onChange={(x) => setEdit({ ...edit, nominal_g: x })} /></Field>
            <Field label="Conventional mass" unit="g"><NumberInput className="h-10" value={edit.conventional_mass_g} onChange={(x) => setEdit({ ...edit, conventional_mass_g: x })} /></Field>
            <Field label="Expanded uncertainty U (k=2)" unit="g"><NumberInput className="h-10" value={edit.U_g} onChange={(x) => setEdit({ ...edit, U_g: x })} /></Field>
            <Field label="Calibration due"><Input type="date" value={edit.cal_due ?? ""} onChange={(ev) => setEdit({ ...edit, cal_due: ev.target.value })} /></Field>
            <Field label="Certificate no." className="sm:col-span-2"><Input value={edit.certificate ?? ""} onChange={(ev) => setEdit({ ...edit, certificate: ev.target.value })} /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={edit.name ?? ""} onChange={(ev) => setEdit({ ...edit, name: ev.target.value })} /></Field>
            <Field label="Kind"><Input value={edit.kind ?? ""} onChange={(ev) => setEdit({ ...edit, kind: ev.target.value })} placeholder="Thermo-hygrometer, climatic chamber…" /></Field>
            <Field label="Make"><Input value={edit.make ?? ""} onChange={(ev) => setEdit({ ...edit, make: ev.target.value })} /></Field>
            <Field label="Serial"><Input value={edit.serial ?? ""} onChange={(ev) => setEdit({ ...edit, serial: ev.target.value })} /></Field>
            <Field label="Certificate no."><Input value={edit.certificate ?? ""} onChange={(ev) => setEdit({ ...edit, certificate: ev.target.value })} /></Field>
            <Field label="Calibration due"><Input type="date" value={edit.cal_due ?? ""} onChange={(ev) => setEdit({ ...edit, cal_due: ev.target.value })} /></Field>
          </div>
        ))}
      </Dialog>
    </div>
  );
}
