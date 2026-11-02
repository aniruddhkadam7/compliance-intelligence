"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, Mono, TableSkeleton } from "@/components/common";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced } from "@/lib/client/hooks";
import { cn, formatNumber } from "@/lib/utils";

export interface RelCitation { id: string; sourceSectionId: string; sectionName: string; framework: { id: string; short: string } }
export interface RelRow { id: string; status: string; note: string | null; fromSourceId: string | null; toSourceId: string | null; from: RelCitation | null; to: RelCitation | null }

export const STATUS_TONE: Record<string, Tone> = {
  UNCHANGED: "neutral", MODIFIED: "warning", ADDED: "success", REMOVED: "danger", SPLIT: "info", COMBINED: "accent",
};
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Side({ c, raw }: { c: RelCitation | null; raw: string | null }) {
  if (!c && !raw) return <span className="text-xs text-subtle">—</span>;
  if (!c) return <span className="text-xs text-warning">Source ID {raw} not in library</span>;
  return (
    <Link href={`/citations?citation=${c.sourceSectionId}`} className="block min-w-0 hover:text-accent">
      <Mono className="text-[11px] text-accent">{c.sourceSectionId}</Mono>
      <div className="line-clamp-2 text-xs text-fg-2">{c.sectionName}</div>
    </Link>
  );
}

/** Paged list of source relationships for one document pair. */
export function RelationshipTable({ kind, from, to, statuses }: { kind: "VERSION_TRANSITION" | "CROSS_FRAMEWORK"; from: string; to: string; statuses?: string[] }) {
  const [text, setText] = useState("");
  const q = useDebounced(text, 300);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, status, from, to]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["relationships", kind, from, to, status, q, page],
    queryFn: () => apiGet<{ items: RelRow[]; total: number; byStatus: Record<string, number> }>(`/api/mappings${qs({ kind, from, to, status, q, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const all = Object.values(data?.byStatus ?? {}).reduce((n, v) => n + v, 0);
  const chips = statuses ?? Object.keys(data?.byStatus ?? {});

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search Source ID or description…" className="pl-8" aria-label="Search relationships" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setStatus("")} className={cn("rounded-md border px-2 py-1 text-xs", !status ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>All {formatNumber(all)}</button>
          {chips.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md border px-2 py-1 text-xs", status === s ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>
              {label(s)} {formatNumber(data?.byStatus[s] ?? 0)}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <TableSkeleton rows={6} cols={3} />}
      {!!error && <ErrorState error={error} onRetry={refetch} />}
      {data && !data.items.length && <EmptyState title="No relationships match" />}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="w-[44%] px-4 py-2">{kind === "VERSION_TRANSITION" ? "Legacy section" : "Section A"}</th>
                <th className="px-3 py-2 text-center">{kind === "VERSION_TRANSITION" ? "Transition" : "Relationship"}</th>
                <th className="w-[44%] px-4 py-2">{kind === "VERSION_TRANSITION" ? "Latest section" : "Section B"}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2.5"><Side c={r.from} raw={r.fromSourceId} /></td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{label(r.status)}</Badge>
                      <ArrowRight className="size-3.5 text-subtle" />
                      {r.note && <span className="max-w-[160px] text-[10.5px] text-muted">{r.note}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><Side c={r.to} raw={r.toSourceId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > 25 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
          <span className="tabular">{formatNumber((page - 1) * 25 + 1)}–{formatNumber(Math.min(page * 25, data.total))} of {formatNumber(data.total)}</span>
          <div className="flex gap-1">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
