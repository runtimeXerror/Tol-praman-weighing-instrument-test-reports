"use client";

import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { AttachmentsPanel } from "@/components/case/panels";
import { PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useCaseDetails } from "@/lib/use-cases";

export default function AttachmentsPage() {
  const { data, reload } = useCaseDetails(["DRAFT", "RETURNED", "SUBMITTED", "APPROVED", "SIGNED"]);
  const [id, setId] = useState("");
  useEffect(() => { if (data?.length && !id) setId((data.find((c) => ["DRAFT", "RETURNED"].includes(c.status)) ?? data[0]).id); }, [data, id]);
  const c = data?.find((x) => x.id === id);
  return (
    <div>
      <PageHeader back={{ href: "/engineer", label: "My Cases" }} title="Attachments" subtitle="Photographs and documents for the report's Examination of construction and annexures. Required categories must be present before submission."
        actions={data?.length ? (
          <Select className="w-80" value={id} onChange={(e) => setId(e.target.value)}>
            {data.map((x) => <option key={x.id} value={x.id}>{x.caseNo} · {x.instrument?.model ?? x.title} ({x.status})</option>)}
          </Select>
        ) : null} />
      {!data ? <Skeleton className="h-72" /> : !c ? <EmptyState icon={<Paperclip className="h-5 w-5" />} title="No cases" /> : (
        <AttachmentsPanel caseId={c.id} attachments={c.attachments ?? []} editable={["DRAFT", "RETURNED"].includes(c.status)} onChange={reload} />
      )}
    </div>
  );
}
