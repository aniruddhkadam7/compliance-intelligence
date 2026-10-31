"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Search, X } from "lucide-react";
import { Page, PageHeader, Mono } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge, Dot } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { DataTable, type SortState } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import { formatDateTime, formatNumber } from "@/lib/utils";

interface FrameworkRow {
  id: string; sourceId: string; name: string; short: string; family: string | null; versionLabel: string | null; type: string | null;
  group: string | null; jurisdiction: string | null; licensing: string | null; documentUrl: string | null; prioritizedByGsk: boolean;
  updatedAt: string; citations: number; requirements: number; controls: number;
  connector: { id: string; name: string; lastStatus: string | null; lastCheckedAt: string | null } | null;
}
interface Facet { value: string; count: number }

export const typeTone = (t: string | null) => (t === "Law or Regulation" ? "warning" : t === "Industry Standard" ? "info" : "neutral");

export function FrameworkRepository() {
  const navigate = useNavigate();
  const [s, set] = useUrlState({ q: "", type: "", jurisdiction: "", group: "", sort: "citations", dir: "desc" });
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (dq !== s.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["frameworks", s.q, s.type, s.jurisdiction, s.group],
    queryFn: () => apiGet<{ items: FrameworkRow[]; facets: { types: Facet[]; jurisdictions: Facet[]; groups: Facet[] } }>(
      `/api/frameworks${qs({ q: s.q, type: s.type, jurisdiction: s.jurisdiction, group: s.group })}`,
    ),
    placeholderData: keepPreviousData,
  });

  // 27 rows: sorting is done client-side on the complete set.
  const rows = useMemo(() => {
    const items = [...(data?.items ?? [])];
    const k = s.sort as keyof FrameworkRow;
    items.sort((a, b) => {
      const x = a[k] ?? "", y = b[k] ?? "";
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return s.dir === "desc" ? -c : c;
    });
    return items;
  }, [data, s.sort, s.dir]);

  const columns = useMemo<ColumnDef<FrameworkRow, unknown>[]>(() => [
    {
      id: "name", header: "Framework",
      cell: ({ row: { original: f } }) => (
        <div className="min-w-[280px] max-w-[460px]">
          <div className="font-medium text-fg">{f.short}</div>
          <div className="line-clamp-1 text-[11px] text-muted">{f.name}</div>
        </div>
      ),
    },
    { id: "versionLabel", header: "Version", size: 80, cell: ({ row }) => row.original.versionLabel ? <Mono>{row.original.versionLabel}</Mono> : <span className="text-subtle">—</span> },
    { id: "type", header: "Category", size: 150, cell: ({ row }) => <Badge tone={typeTone(row.original.type)}>{row.original.type ?? "—"}</Badge> },
    { id: "group", header: "Group", size: 160, cell: ({ row }) => <span className="whitespace-nowrap text-fg-2">{row.original.group}</span> },
    { id: "jurisdiction", header: "Jurisdiction", size: 90, cell: ({ row }) => <span className="text-fg-2">{row.original.jurisdiction}</span> },
    { id: "citations", header: "Citations", size: 90, cell: ({ row }) => <span className="tabular">{formatNumber(row.original.citations)}</span> },
    { id: "requirements", header: "IRs", size: 60, cell: ({ row }) => <span className="tabular">{row.original.requirements}</span> },
    { id: "controls", header: "Controls", size: 80, cell: ({ row }) => <span className="tabular">{row.original.controls}</span> },
    {
      id: "status", header: "Status", enableSorting: false, size: 150,
      cell: ({ row: { original: f } }) => (
        <div className="flex flex-col gap-1">
          {f.prioritizedByGsk && <span className="flex items-center gap-1.5 text-xs text-fg-2"><Dot tone="success" />Prioritised by GSK</span>}
          {f.connector ? (
            <Tooltip content={`Monitored by ${f.connector.name}`}>
              <span className="flex items-center gap-1.5 text-xs text-fg-2"><Dot tone={f.connector.lastStatus === "ERROR" ? "danger" : f.connector.lastStatus === "CHANGED" ? "warning" : "info"} />Monitored</span>
            </Tooltip>
          ) : null}
        </div>
      ),
    },
    { id: "updatedAt", header: "Last updated", size: 130, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(row.original.updatedAt)}</span> },
    {
      id: "source", header: "Source", enableSorting: false, size: 60,
      cell: ({ row }) => row.original.documentUrl ? (
        <a href={row.original.documentUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-accent" aria-label="Open source document">
          <ExternalLink className="size-3.5" />
        </a>
      ) : null,
    },
  ], []);

  const facets = data?.facets;
  const active = [s.q, s.type, s.jurisdiction, s.group].some(Boolean);

  return (
    <Page>
      <PageHeader
        title="Framework Repository"
        description="Authoritative sources from “ArC Parent Sources (Metadata)”. Version labels and families are derived from the source name. The workbook contains no publication dates."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, Source ID or description…" className="pl-8" aria-label="Search frameworks" />
          </div>
          <Select value={s.type} onChange={(v) => set({ type: v })} allLabel="All categories" options={(facets?.types ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Category" />
          <Select value={s.group} onChange={(v) => set({ group: v })} allLabel="All groups" options={(facets?.groups ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Group" />
          <Select value={s.jurisdiction} onChange={(v) => set({ jurisdiction: v })} allLabel="All jurisdictions" options={(facets?.jurisdictions ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Jurisdiction" />
          {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", type: "", jurisdiction: "", group: "" }); }}><X /> Clear</Button>}
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{rows.length} frameworks · {formatNumber(rows.reduce((n, r) => n + r.citations, 0))} citations</div>
        <DataTable
          columns={columns}
          data={data ? rows : undefined}
          loading={isLoading}
          error={error}
          onRetry={refetch}
          rowKey={(r) => r.id}
          sort={{ id: s.sort, desc: s.dir === "desc" }}
          onSortChange={(x: SortState) => set({ sort: x?.id ?? "citations", dir: x ? (x.desc ? "desc" : "asc") : "desc" })}
          onRowClick={(r) => navigate(`/frameworks/${r.id}`)}
        />
      </Card>
    </Page>
  );
}
