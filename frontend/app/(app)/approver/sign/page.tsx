"use client";

import { PenLine } from "lucide-react";
import { useState } from "react";
import { SignDialog } from "@/components/case/sign-dialog";
import { VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ago } from "@/lib/format";
import { useApi } from "@/lib/hooks";

export default function SignAndLock() {
  const q = useApi<any[]>("/cases?status=APPROVED");
  const [sel, setSel] = useState<any>(null);
  return (
    <div>
      <PageHeader back={{ href: "/approver", label: "Lab Dashboard" }} title="Sign & Lock" subtitle="Approved cases waiting for the digital seal. Signing produces the PDF and Word report, the QR verification link and a digital fingerprint that detects any edit." />
      {!q.data ? <Skeleton className="h-64" /> : q.data.length === 0 ? (
        <EmptyState icon={<PenLine className="h-5 w-5" />} title="Nothing to sign" text="Approve a case from the review queue first." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((c) => (
            <Card key={c.id} className="flex flex-col p-5 animate-slide-up">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-navy-600 dark:text-navy-300">{c.caseNo}</span>
                <VerdictBadge v={c.verdict} />
              </div>
              <p className="mt-2 font-semibold">{c.title}</p>
              <p className="text-muted mt-1 text-xs">{c.manufacturer?.name}</p>
              <p className="text-muted mt-1 text-xs">Approved {ago(c.approvedAt)} · engineer {c.assignedEngineer?.name}</p>
              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="secondary" size="sm" href={`/approver/cases/${c.id}`}>Open</Button>
                <Button size="sm" className="flex-1" onClick={() => setSel(c)}><PenLine className="h-3.5 w-3.5" /> Sign & lock</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <SignDialog c={sel} open={!!sel} onClose={() => setSel(null)} onDone={q.reload} />
    </div>
  );
}
