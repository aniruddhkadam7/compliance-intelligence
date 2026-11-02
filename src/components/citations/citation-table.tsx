"use client";
import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/common";
import { apiGet, qs } from "@/lib/client/api";

export interface CitationRow {
  id: string;
  sourceSectionId: string;
  sectionName: string;
  sectionLabel: string;
  framework: { id: string; name: string; short: string; versionLabel: string | null; sourceId: string };
  controls: number;
}

export interface CitationQuery {
  q?: string;
  field?: string;
  frameworkId?: string;
  family?: string;
  version?: string;
  requirementId?: string;
  mapped?: string;
  sort?: string;
  dir?: string;
  page: number;
  pageSize?: number;
}

export function useCitations(query: CitationQuery) {
  return useQuery({
    queryKey: ["citations", query],
    queryFn: () => apiGet<{ items: CitationRow[]; total: number; page: number; pageSize: number }>(`/api/citations${qs({ ...query })}`),
    placeholderData: keepPreviousData,
  });
}

export function CitationTable({
  query, onPage, onSort, onOpen, selectedId, hideFramework,
}: {
  query: CitationQuery;
  onPage: (p: number) => void;
  onSort: (s: { id: string; desc: boolean } | null) => void;
  onOpen: (sectionId: string) => void;
  selectedId?: string | null;
  hideFramework?: boolean;
}) {
  const { data, isLoading, error, refetch } = useCitations(query);
  const columns = useMemo<ColumnDef<CitationRow, unknown>[]>(() => {
    const cols: ColumnDef<CitationRow, unknown>[] = [
      { id: "sectionId", header: "Obligation ID", size: 110, cell: ({ row }) => <Mono>{row.original.sourceSectionId}</Mono> },
      {
        id: "sectionName", header: "Requirement description",
        cell: ({ row }) => (
          <div className="min-w-[280px]">
            <div className="font-medium text-fg">{row.original.sectionLabel}</div>
            <div className="line-clamp-1 text-[11px] text-muted">{row.original.sectionName}</div>
          </div>
        ),
      },
    ];
    if (!hideFramework)
      cols.push({
        id: "framework", header: "Framework", size: 200,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="text-fg-2">{row.original.framework.short}</span>
          </div>
        ),
      });
    cols.push(
      {
        id: "controls", header: "Control map", enableSorting: false, size: 110,
        cell: ({ row }) => {
          const n = row.original.controls;
          return n ? <Badge tone="accent">{n} control{n > 1 ? "s" : ""}</Badge> : <Badge tone="warning">None</Badge>;
        },
      },
    );
    return cols;
  }, [hideFramework]);

  return (
    <DataTable
      columns={columns}
      data={data?.items}
      total={data?.total}
      page={query.page}
      pageSize={query.pageSize ?? 25}
      onPageChange={onPage}
      sort={query.sort ? { id: query.sort, desc: query.dir === "desc" } : null}
      onSortChange={onSort}
      loading={isLoading}
      error={error}
      onRetry={refetch}
      rowKey={(r) => r.sourceSectionId}
      selectedKey={selectedId}
      onRowClick={(r) => onOpen(r.sourceSectionId)}
    />
  );
}
