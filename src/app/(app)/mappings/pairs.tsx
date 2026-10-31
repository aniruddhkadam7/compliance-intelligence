"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mono, StatStrip } from "@/components/common";
import { DataTable } from "@/components/data-table";
import { CitationDetailSheet } from "@/components/citations/citation-detail";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced } from "@/lib/client/hooks";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

interface Cit { id: string; sid: string; name: string }
interface PairRow { id: string; requirementId: string; name: string | null; riskTopic: string | null; sourceCitations: Cit[]; targetCitations: Cit[]; controls: { id: string; name: string }[] }
interface PairResponse {
  items: PairRow[]; total: number;
  summary: { sourceRequirements: number; targetRequirements: number; shared: number; sourceCitations: number; mappedShared: number };
}

const label = (n: string) => n.split(" - ").slice(-1)[0];

function CitationList({ items, onOpen, max = 4 }: { items: Cit[]; onOpen: (sid: string) => void; max?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <span className="text-xs text-subtle">No citation</span>;
  const shown = all ? items : items.slice(0, max);
  return (
    <div className="min-w-[220px] space-y-0.5">
      {shown.map((c) => (
        <button key={c.id} onClick={(e) => { e.stopPropagation(); onOpen(c.sid); }} className="flex w-full items-baseline gap-1.5 text-left text-xs hover:text-accent" title={c.name}>
          <Mono className="shrink-0 text-[10.5px] text-subtle">{c.sid}</Mono>
          <span className="truncate text-fg-2">{label(c.name)}</span>
        </button>
      ))}
      {items.length > max && (
        <button onClick={(e) => { e.stopPropagation(); setAll(!all); }} className="text-[11px] font-medium text-accent hover:underline">
          {all ? "Show fewer" : `+${items.length - max} more`}
        </button>
      )}
    </div>
  );
}

export function PairsView({
  source, target, status, q, page, set,
}: { source: string; target: string; status: string; q: string; page: number; set: (p: Record<string, string>) => void }) {
  const [text, setText] = useState(q);
  const dq = useDebounced(text, 300);
  useEffect(() => {
    if (dq !== q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const [citation, setCitation] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pairs", source, target, status, q, page],
    queryFn: () => apiGet<PairResponse>(`/api/mappings${qs({ source, target, status: target ? status : "all", q, page })}`),
    placeholderData: keepPreviousData,
  });
  const sm = data?.summary;

  const columns = useMemo<ColumnDef<PairRow, unknown>[]>(() => {
    const cols: ColumnDef<PairRow, unknown>[] = [
      {
        id: "req", header: "Integrated requirement", enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-[220px] max-w-[300px]">
            <Link href={`/requirements/${r.requirementId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-fg hover:text-accent">IR {r.requirementId} · {r.name?.replace(/^IRM - /, "")}</Link>
            <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{r.riskTopic}</div>
          </div>
        ),
      },
      { id: "src", header: "Source citations", enableSorting: false, cell: ({ row }) => <CitationList items={row.original.sourceCitations} onOpen={setCitation} /> },
    ];
    if (target) cols.push({ id: "tgt", header: "Target citations", enableSorting: false, cell: ({ row }) => <CitationList items={row.original.targetCitations} onOpen={setCitation} /> });
    cols.push({
      id: "ctl", header: "CCF controls", enableSorting: false,
      cell: ({ row }) => row.original.controls.length ? (
        <div className="flex max-w-[220px] flex-wrap gap-1">
          {row.original.controls.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/controls/${encodeURIComponent(c.name)}`} onClick={(e) => e.stopPropagation()}><Badge tone="accent" className="font-mono hover:opacity-80">{c.name}</Badge></Link>
          ))}
          {row.original.controls.length > 6 && <Badge>+{row.original.controls.length - 6}</Badge>}
        </div>
      ) : <Badge tone="warning">Unmapped</Badge>,
    });
    return cols;
  }, [target]);

  return (
    <div className="space-y-4">
      {sm && (
        <StatStrip
          className="xl:grid-cols-5"
          items={[
            { label: "Source citations", value: sm.sourceCitations },
            { label: "Source requirements", value: sm.sourceRequirements, sub: "Distinct IRs cited" },
            ...(target
              ? [
                  { label: "Target requirements", value: sm.targetRequirements },
                  { label: "Shared requirements", value: sm.shared, tone: "accent" as const, sub: `${formatPercent(sm.shared / Math.max(1, sm.sourceRequirements), 0)} of source IRs` },
                  { label: "Shared & CCF-mapped", value: sm.mappedShared, sub: `${sm.shared - sm.mappedShared} shared IRs lack a control` },
                ]
              : []),
          ]}
        />
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search requirement, risk topic or citation…" className="pl-8" aria-label="Search mappings" />
          </div>
          {target && (
            <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Relationship status">
              {[["all", "All source IRs"], ["shared", "Shared with target"], ["unmatched", "Not in target"]].map(([v, l]) => (
                <button key={v} role="radio" aria-checked={status === v} onClick={() => set({ status: v })} className={cn("rounded-[4px] px-2.5 py-1 text-xs font-medium", status === v ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{data ? `${formatNumber(data.total)} integrated requirements` : "…"}</div>
        <DataTable
          columns={columns}
          data={data?.items}
          total={data?.total}
          page={page}
          onPageChange={(p) => set({ page: String(p) })}
          loading={isLoading}
          error={error}
          onRetry={refetch}
          rowKey={(r) => r.id}
        />
      </Card>
      <CitationDetailSheet citationId={citation} onClose={() => setCitation(null)} />
    </div>
  );
}
