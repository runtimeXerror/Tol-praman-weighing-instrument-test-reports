"use client";

import { KeyRound, Plus, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SearchBox } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Dialog, Stat, td, th, TableWrap } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth";
import { ago } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const empty = { name: "", email: "", role: "ENGINEER", designation: "", phone: "", password: "" };

export default function Users() {
  const q = useApi<any[]>("/admin/users");
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>(empty);
  const [s, setS] = useState("");
  const [busy, setBusy] = useState(false);
  const open = (u?: any) => { setEdit(u ?? {}); setF(u ? { ...u, password: "" } : empty); };
  const save = async () => {
    setBusy(true);
    try {
      const body: any = { name: f.name, email: f.email, role: f.role, designation: f.designation || undefined, phone: f.phone || undefined, ...(f.password ? { password: f.password } : {}), ...(edit?.id ? { active: f.active } : {}) };
      if (edit?.id) await api(`/admin/users/${edit.id}`, { method: "PUT", body });
      else await api("/admin/users", { body });
      toast.success("User saved");
      setEdit(null);
      q.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const list = (q.data ?? []).filter((u) => !s || [u.name, u.email, u.role, u.designation].some((x) => x?.toLowerCase().includes(s.toLowerCase())));
  const count = (r: string) => (q.data ?? []).filter((u) => u.role === r && u.active).length;

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Users & Roles" subtitle="Three roles. Test engineers enter data, senior engineers review, approve and sign, administrators manage the system and never touch reports."
        actions={<Button onClick={() => open()}><Plus className="h-4 w-4" /> Add user</Button>} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lab In-charge" value={count("INCHARGE")} tone="pass" hint="Receive instruments, assign and reassign test engineers" />
        <Stat label="Test Engineers" value={count("ENGINEER")} hint="Enter profile, readings, environment, attachments; submit" />
        <Stat label="Senior Engineers" value={count("APPROVER")} tone="violet" hint="Review each test, send back, approve, sign & lock" />
        <Stat label="Administrators" value={count("ADMIN")} tone="saffron" hint="Users, lab profile, equipment, standards, activity log" />
      </div>
      <Card>
        <CardHeader title="Accounts" icon={<UserCog className="h-4 w-4" />} actions={<SearchBox value={s} onChange={setS} placeholder="Search users…" />} />
        <TableWrap>
          <table className="w-full">
            <thead className="surface-2 border-b border-line"><tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Designation</th><th className={th}>Status</th><th className={th}>Last login</th><th className={th} /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className={td}><p className="font-medium">{u.name}</p><p className="text-muted text-xs">{u.email}</p></td>
                  <td className={td}><Badge tone={u.role === "ENGINEER" ? "navy" : u.role === "APPROVER" ? "violet" : u.role === "INCHARGE" ? "pass" : "saffron"}>{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL].en}</Badge></td>
                  <td className={cn(td, "text-muted")}>{u.designation ?? "—"}</td>
                  <td className={td}><div className="flex flex-wrap gap-1">{u.active ? <Badge tone="pass">Active</Badge> : <Badge tone="slate">Disabled</Badge>}{u.mustChangePassword && <Badge tone="cond">Must set new password</Badge>}</div></td>
                  <td className={cn(td, "text-muted text-xs")}>{u.lastLoginAt ? ago(u.lastLoginAt) : "never"}</td>
                  <td className={cn(td, "text-right")}><Button size="sm" variant="ghost" onClick={() => open(u)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit user" : "Add user"}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="INCHARGE">Lab In-charge</option><option value="ENGINEER">Test Engineer</option><option value="APPROVER">Senior Engineer</option><option value="ADMIN">Administrator</option>
            </Select>
          </Field>
          <Field label="Designation"><Input value={f.designation ?? ""} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
          <Field label={edit?.id ? "Reset password" : "Temporary password"} hint="At least 8 characters. The user must set their own password at first login." className="sm:col-span-2">
            <div className="relative"><KeyRound className="text-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" /><Input type="password" className="pl-9" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={edit?.id ? "Leave empty to keep" : ""} /></div>
          </Field>
          {edit?.id && <div className="sm:col-span-2"><Switch checked={!!f.active} onChange={(x) => setF({ ...f, active: x })} label="Account active" description="Disabling signs the user out everywhere" /></div>}
        </div>
      </Dialog>
    </div>
  );
}
