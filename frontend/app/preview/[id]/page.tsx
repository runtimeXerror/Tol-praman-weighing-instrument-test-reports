"use client";

import { useParams } from "next/navigation";
import { ReportPreview } from "@/components/case/report-preview";

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-dvh bg-slate-200 p-2 sm:p-6">
      <p className="mx-auto mb-2 max-w-5xl text-center text-xs font-semibold text-slate-600">DRAFT PREVIEW — not signed, not valid as a report</p>
      <ReportPreview caseId={id} className="mx-auto block h-[calc(100dvh-4rem)] w-full max-w-5xl rounded-xl bg-white shadow-2xl" />
    </div>
  );
}
