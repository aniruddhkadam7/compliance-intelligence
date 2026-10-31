"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/common";
import { cn } from "@/lib/utils";
import type { Cit, Comparison } from "./types";

const STATUS = {
  BOTH: { label: "Cited by both", tone: "neutral" as const },
  ONLY_OLD: { label: "Removed in new version", tone: "danger" as const },
  ONLY_NEW: { label: "Added in new version", tone: "success" as const },
};

function Cits({ items }: { items: Cit[] }) {
  if (!items.length) return <span className="text-xs text-subtle">Not cited</span>;
  return (
    <ul className="space-y-0.5">
      {items.slice(0, 6).map((c) => (
        <li key={c.id}>
          <Link href={`/citations?citation=${c.sid}`} className="flex gap-1.5 text-xs hover:text-accent" title={c.name}>
            <Mono className="shrink-0 text-[10.5px] text-subtle">{c.sid}</Mono><span className="text-fg-2">{c.name.split(" - ").slice(-1)[0]}</span>
          </Link>
        </li>
      ))}
      {items.length > 6 && <li className="text-[11px] text-muted">+{items.length - 6} more</li>}
    </ul>
  );
}

export function RequirementShift({ c }: { c: Comparison }) {
  const [filter, setFilter] = useState<"" | "BOTH" | "ONLY_OLD" | "ONLY_NEW" | "SHIFT">("SHIFT");
  const rows = useMemo(() => c.requirements.filter((r) => (filter === "SHIFT" ? r.functionChanged : !filter || r.status === filter)), [c.requirements, filter]);
  return (
    <Card>
      <CardHeader
        title="Requirement-level citation changes"
        description={`For each integrated requirement: its ${c.from.short} citations next to its ${c.to.short} citations, with the CSF function or domain parsed from the section path.`}
        actions={
          <div className="flex rounded-md border border-border p-0.5">
            {([["SHIFT", `Function shifts (${c.summary.functionChanged})`], ["", "All"], ["BOTH", "Both"], ["ONLY_OLD", "Removed"], ["ONLY_NEW", "Added"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={cn("rounded-[4px] px-2 py-1 text-xs font-medium", filter === v ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{l}</button>
            ))}
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Requirement</th><th className="px-3 py-2">Function / domain</th><th className="px-3 py-2">{c.from.short} citations</th><th className="px-3 py-2">{c.to.short} citations</th><th className="px-4 py-2">CCF controls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border align-top last:border-0">
                <td className="w-[240px] px-4 py-2.5">
                  <Link href={`/requirements/${r.requirementId}`} className="text-[13px] font-medium text-fg hover:text-accent">IR {r.requirementId} · {r.name?.replace(/^IRM - /, "")}</Link>
                  <div className="mt-1"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></div>
                </td>
                <td className="w-[220px] px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    {r.oldFunctions.map((f) => <Badge key={f} tone="outline">{f}</Badge>)}
                    {r.status === "BOTH" && <ArrowRight className="size-3 text-subtle" />}
                    {r.newFunctions.map((f) => <Badge key={f} tone={r.functionChanged && !r.oldFunctions.includes(f) ? "info" : "outline"}>{f}</Badge>)}
                  </div>
                </td>
                <td className="px-3 py-2.5"><Cits items={r.oldCitations} /></td>
                <td className="px-3 py-2.5"><Cits items={r.newCitations} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex max-w-[200px] flex-wrap gap-1">
                    {r.controls.length ? r.controls.map((k) => <Link key={k.id + k.type} href={`/controls/${encodeURIComponent(k.name)}`}><Badge tone={k.type === "PRIMARY" ? "accent" : "outline"} className="font-mono">{k.name}</Badge></Link>) : <span className="text-xs text-subtle">None</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
