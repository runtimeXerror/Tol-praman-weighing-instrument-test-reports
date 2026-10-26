"use client";

import { ArrowRight, MessageSquareWarning, PartyPopper } from "lucide-react";
import { Badge, VerdictBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ago } from "@/lib/format";
import { useCaseDetails } from "@/lib/use-cases";

/** Returned cases with the senior engineer's open comments (shown under My Cases → Returned). */
export function ReturnedList({ search = "" }: { search?: string }) {
  const { data: all } = useCaseDetails(["RETURNED"]);
  const t = search.toLowerCase();
  const data = all?.filter((c) => !t || [c.caseNo, c.title, c.manufacturer?.name, c.instrument?.model, c.applicationNo].some((x: string | undefined) => x?.toLowerCase().includes(t)));
  return (
    <div>
      {!data ? <Skeleton className="h-60" /> : data.length === 0 ? (
        <EmptyState icon={<PartyPopper className="h-5 w-5" />} title={search ? "No cases match your search" : "Nothing returned"} text={search ? "Try a different search term." : "No cases are waiting for corrections."} />
      ) : (
        <div className="space-y-5">
          {data.map((c) => {
            const comments = (c.comments ?? []).filter((x: any) => x.kind === "return" && !x.resolved);
            return (
              <Card key={c.id} className="overflow-hidden border-saffron-200 dark:border-saffron-700/30 animate-slide-up">
                <CardHeader icon={<MessageSquareWarning className="h-4 w-4" />}
                  title={<span><span className="font-mono text-sm text-navy-600 dark:text-navy-300">{c.caseNo}</span> · {c.title}</span>}
                  subtitle={`Returned ${ago(c.returnedAt)} · ${comments.length} point(s) to address`}
                  actions={<><VerdictBadge v={c.verdict} /><Button size="sm" href={`/engineer/cases/${c.id}`}>Open case <ArrowRight className="h-3.5 w-3.5" /></Button></>} />
                <CardBody className="space-y-3">
                  {comments.map((x: any) => (
                    <div key={x._id} className="flex gap-3 rounded-xl bg-saffron-50 p-3 dark:bg-saffron-700/10">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{x.author?.name?.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</div>
                      <div className="min-w-0 text-sm">
                        <p className="flex flex-wrap items-center gap-2 text-xs"><b>{x.author?.name}</b>{x.testId && <Badge tone="navy">{x.testId}</Badge>}<span className="text-muted">{ago(x.createdAt)}</span></p>
                        <p className="mt-0.5">{x.text}</p>
                        {x.testId && <Button size="sm" variant="link" href={`/engineer/cases/${c.id}?tab=tests&test=${x.testId}`}>Go to {x.testId} →</Button>}
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
