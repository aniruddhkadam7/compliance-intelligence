"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import type { Comparison } from "./types";

/** Previous → new function, counted by integrated requirement (requirements cited by both versions). */
export function FunctionFlow({ c }: { c: Comparison }) {
  const max = Math.max(1, ...c.flows.map((f) => f.count));
  return (
    <Card>
      <CardHeader title="Function / domain flow" description={`Integrated requirements cited by both versions, grouped by previous ${c.from.short} function → new ${c.to.short} function. One requirement can appear in several flows.`} />
      <CardBody>
        {!c.flows.length ? <EmptyState title="No shared requirements" /> : (
          <ul className="space-y-2">
            {c.flows.map((f) => {
              const moved = f.from !== f.to;
              return (
                <li key={f.from + f.to} className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 text-[13px]">
                  <span className="truncate text-right text-fg-2">{f.from}</span>
                  <ArrowRight className="size-3.5 text-subtle" />
                  <span className={moved ? "truncate font-medium text-fg" : "truncate text-fg-2"}>{f.to}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${(f.count / max) * 100}%`, background: moved ? "var(--chart-1)" : "var(--chart-muted)" }} />
                    </div>
                    <span className="w-8 text-right text-xs text-muted tabular">{f.count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-[2px] bg-[var(--chart-1)]" />Function changes</span>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-[2px] bg-[var(--chart-muted)]" />Same function</span>
        </div>
      </CardBody>
    </Card>
  );
}

export function ImpactList({ c }: { c: Comparison }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Indicative impact only. These controls are linked to requirements or references that differ between versions. A framework change does not always change a CCF mapping:
          each item needs SME review. Scenario 1 means the test procedure needs additional checks; Scenario 2 means the mapping changes. No mapping has been altered.
        </span>
      </div>
      <Card>
        <CardHeader title="Controls to review" description={`${c.impactedControls.length} controls · ${c.from.short} → ${c.to.short}`} />
        {!c.impactedControls.length ? <EmptyState title="No impacted controls" /> : (
          <ul className="divide-y divide-border">
            {c.impactedControls.map((k) => (
              <li key={k.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                <Link href={`/controls/${encodeURIComponent(k.name)}`} className="w-32 shrink-0 font-mono text-[13px] font-medium text-fg hover:text-accent">{k.name}</Link>
                <div className="flex flex-wrap gap-1">{k.reasons.map((r) => <Badge key={r} tone={/no longer/.test(r) ? "danger" : /newly/.test(r) ? "success" : "info"}>{r}</Badge>)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
