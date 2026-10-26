"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** Full details of the engineer's cases in the given statuses (lists exclude results, so fetch details). */
export function useCaseDetails(statuses: string[]) {
  const [data, setData] = useState<any[] | null>(null);
  const key = statuses.join(",");
  const load = useCallback(async () => {
    const list = await api<any[]>(`/cases?status=${key}`);
    const details = await Promise.all(list.map((c) => api(`/cases/${c.id}`)));
    setData(details);
  }, [key]);
  useEffect(() => { load().catch(() => setData([])); }, [load]);
  return { data, reload: load };
}
