"use client";

import { useParams } from "next/navigation";
import { ReviewScreen } from "@/components/case/review";

export default function ApproverCasePage() {
  const { id } = useParams<{ id: string }>();
  return <ReviewScreen id={id} />;
}
