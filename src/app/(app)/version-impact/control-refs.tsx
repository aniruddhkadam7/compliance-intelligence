"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import { cn } from "@/lib/utils";
import type { Comparison } from "./types";

const FILTERS = [
  ["", "All"],
  ["changed", "Changed"],
  ["unchanged", "Unchanged"],
  ["govern", "Gains Govern (GV) references"],
] as const;

function Token({ t, tone }: { t: string; tone: "added" | "removed" | "same" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[3px] border px-1.5 py-px font-mono text-[11px]",
        tone === "added" && "border-transparent bg-success-soft text-success",
        tone === "removed" && "border-transparent bg-danger-soft text-danger line-through decoration-danger/50",
        tone === "same" && "border-border bg-surface-2 text-fg-2",
      )}
    >
      {tone === "added" ? "+ " : tone === "removed" ? "− " : ""}{t}
    </span>
  );
}

export function ControlReferenceDiff({ c, only, setOnly }: { c: Comparison; only: string; setOnly: (v: string) => void }) {
  const rows = useMemo(
    () =>
      c.controlRefs.filter((r) => {
        const changed = r.added.length + r.removed.length > 0;
        if (only === "changed") return changed;
        if (only === "unchanged") return !changed;
        if (only === "govern") return r.added.some((t) => /^GV\./i.test(t));
        return true;
      }),
    [c.controlRefs, only],
  );

  if (!c.referenceColumns)
    return <Card><EmptyState title="No version-specific reference columns" description="The CCF working sheet does not state separate references for these two versions. See the requirement citation changes instead." /></Card>;

  return (
    <Card>
      <CardHeader
        title="Direct CCF control references, side by side"
        description={`Columns “${c.referenceColumns.old}” and “${c.referenceColumns.new}” on the Metadata(CCFv2) working sheet. Token-level comparison of what the workbook states; equivalence between identifiers is not inferred.`}
        actions={
          <div className="flex rounded-md border border-border p-0.5">
            {FILTERS.map(([v, l]) => (
              <button key={v} onClick={() => setOnly(v)} className={cn("rounded-[4px] px-2 py-1 text-xs font-medium", only === v ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{l}</button>
            ))}
          </div>
        }
      />
      <div className="flex flex-wrap gap-3 border-b border-border px-4 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><Token t="ID" tone="same" /> unchanged</span>
        <span className="flex items-center gap-1.5"><Token t="ID" tone="removed" /> only in {c.from.short}</span>
        <span className="flex items-center gap-1.5"><Token t="ID" tone="added" /> only in {c.to.short}</span>
        <span>{rows.length} controls</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Control</th><th className="px-3 py-2">{c.referenceColumns.old}</th><th className="px-3 py-2">{c.referenceColumns.new}</th><th className="px-4 py-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changed = r.added.length + r.removed.length > 0;
              const scope = r.added.some((t) => /^GV\./i.test(t));
              return (
                <tr key={r.control.id} className="border-b border-border align-top last:border-0">
                  <td className="w-[260px] px-4 py-2.5">
                    <Link href={`/controls/${encodeURIComponent(r.control.controlName)}`} className="font-mono text-[13px] font-medium text-fg hover:text-accent">{r.control.controlName}</Link>
                    <div className="line-clamp-2 text-[11px] text-muted">{r.control.title}</div>
                  </td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{r.unchanged.map((t) => <Token key={t} t={t} tone="same" />)}{r.removed.map((t) => <Token key={t} t={t} tone="removed" />)}{r.reformatted.map((x) => <Token key={x.from} t={x.from} tone="same" />)}{!r.oldRaw && <span className="text-xs text-subtle">empty</span>}</div></td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{r.unchanged.map((t) => <Token key={t} t={t} tone="same" />)}{r.added.map((t) => <Token key={t} t={t} tone="added" />)}{r.reformatted.map((x) => <Token key={x.to} t={x.to} tone="same" />)}{!r.newRaw && <span className="text-xs text-subtle">empty</span>}</div></td>
                  <td className="w-[180px] px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {!changed && !r.reformatted.length && <Badge>Unchanged</Badge>}
                      {!changed && r.reformatted.length > 0 && <Badge tone="outline">Identifier format only</Badge>}
                      {r.added.length > 0 && r.removed.length > 0 && <Badge tone="warning">Modified</Badge>}
                      {r.added.length > 0 && !r.removed.length && <Badge tone="success">Added</Badge>}
                      {r.removed.length > 0 && !r.added.length && <Badge tone="danger">Removed</Badge>}
                      {scope && <Badge tone="info">Scope → Govern</Badge>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <EmptyState title="No controls match this filter" />}
      </div>
    </Card>
  );
}
