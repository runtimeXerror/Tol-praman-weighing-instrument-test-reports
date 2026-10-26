"use client";

import { ReportsTable } from "@/components/case/reports-table";
import { PageHeader } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export default function SearchReports() {
  const { user } = useAuth();
  const isApprover = user?.role === "APPROVER";
  const base = isApprover ? "/approver/cases" : "/engineer/cases";
  return (
    <div>
      <PageHeader back={isApprover ? { href: "/approver", label: "Lab Dashboard" } : { href: "/engineer", label: "My Cases" }}
        title="Search Reports" subtitle="Instrument-wise test history: search every signed report by model, serial number, manufacturer, report, case or application number, verdict and date. Instrument history lists every report and revision of one model." />
      <ReportsTable caseHref={(id) => `${base}/${id}`} />
    </div>
  );
}
