"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import type { Comparison } from "./types";

type RefRow = Comparison["controlRefs"][number];

/** Controls whose stated references differ between the legacy and latest version. */
export function ImpactList({ c, impacted }: { c: Comparison; impacted: RefRow[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Indicative impact only. These controls reference different {c.to.short} sections than {c.from.short} sections. A framework change does not always change a CCF mapping:
          each item needs review. No mapping has been altered.
        </span>
      </div>
      <Card>
        <CardHeader title="Controls to review" description={`${impacted.length} controls · ${c.from.short} → ${c.to.short}`} />
        {!impacted.length ? <EmptyState title="No impacted controls" /> : (
          <ul className="divide-y divide-border">
            {impacted.map((r) => {
              const govern = r.added.some((t) => /^GV\./i.test(t));
              return (
                <li key={r.control.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                  <div className="w-56 shrink-0">
                    <Link href={`/controls/${encodeURIComponent(r.control.controlName)}`} className="font-mono text-[13px] font-medium text-fg hover:text-accent">{r.control.controlName}</Link>
                    <div className="line-clamp-2 text-[11px] text-muted">{r.control.title}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.removed.length > 0 && <Badge tone="danger">{r.removed.length} {c.from.short} reference{r.removed.length > 1 ? "s" : ""} dropped</Badge>}
                    {r.added.length > 0 && <Badge tone="success">{r.added.length} {c.to.short} reference{r.added.length > 1 ? "s" : ""} added</Badge>}
                    {govern && <Badge tone="info">Scope → Govern</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
