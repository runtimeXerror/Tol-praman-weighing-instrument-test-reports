"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Skeleton } from "../ui/misc";

/** Draft report (not sealed) rendered by the backend with the same template as the signed PDF. */
export function ReportPreview({ caseId, className }: { caseId: string; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<string>(`/cases/${caseId}/preview`).then(setHtml).catch((e) => setErr(errMsg(e)));
  }, [caseId]);
  if (err) return <p className="text-sm text-fail-600">{err}</p>;
  if (!html) return <Skeleton className={className ?? "h-[80vh]"} />;
  return <iframe title="Report preview" srcDoc={html} className={className ?? "h-[80vh] w-full rounded-xl border border-line bg-white"} sandbox="allow-same-origin" />;
}
