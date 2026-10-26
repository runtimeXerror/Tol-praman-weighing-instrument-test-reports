"use client";

import { ReportsTable } from "@/components/case/reports-table";
import { PageHeader } from "@/components/ui/card";

export default function SignedReports() {
  return (
    <div>
      <PageHeader back={{ href: "/approver", label: "Lab Dashboard" }} title="Signed Reports" subtitle="Sealed PDF and editable Word copies, public verification links and revocation. Open a case to revoke its report." />
      <ReportsTable caseHref={(id) => `/approver/cases/${id}`} />
    </div>
  );
}
