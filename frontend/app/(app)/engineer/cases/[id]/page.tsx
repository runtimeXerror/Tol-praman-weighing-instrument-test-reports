"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { CaseWorkspace } from "@/components/case/workspace";

export default function EngineerCasePage() {
  const { id } = useParams<{ id: string }>();
  return <Suspense><CaseWorkspace id={id} /></Suspense>;
}
