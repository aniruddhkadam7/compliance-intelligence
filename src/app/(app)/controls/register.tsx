"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import { Mono, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import { formatNumber } from "@/lib/utils";

interface ControlRow {
  id: string; controlName: string; title: string | null; category: string | null; subCategory: string | null; scope: string | null;
  technicalType: string | null; productTeamFacing: string | null;
  mappings: { mappingType: "PRIMARY" | "SECONDARY"; rawValue: string; requirementId: string | null; requirement: { requirementId: string; name: string | null; _count: { citations: number } } | null }[];
  _count: { testProcedures: number; evidence: number; frameworkReferences: number };
}
interface Facet { value: string; count: number }

export function ControlRegister() {
  const navigate = useNavigate();
  const [s, set] = useUrlState({ q: "", category: "", scope: "", prefix: "", mapping: "", sort: "controlName", dir: "asc", page: "1" });
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 300);
  useEffect(() => {
    if (dq !== s.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const page = Number(s.page) || 1;

  const facets = useQuery({ queryKey: ["control-facets"], queryFn: () => apiGet<{ categories: Facet[]; scopes: Facet[]; prefixes: Facet[] }>("/api/controls?view=facets") });
  const list = useQuery({
    queryKey: ["controls", s],
    queryFn: () => apiGet<{ items: ControlRow[]; total: number }>(`/api/controls${qs({ ...s, page })}`),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<ControlRow, unknown>[]>(() => [
    { id: "controlName", header: "Control", size: 120, cell: ({ row }) => <Mono className="whitespace-nowrap font-medium text-fg">{row.original.controlName}</Mono> },
    {
      id: "title", header: "Common control title",
      cell: ({ row }) => (
        <div className="min-w-[300px] max-w-[520px]">
          <div className="line-clamp-2 text-fg">{row.original.title ?? <span className="text-subtle">No title</span>}</div>
          {row.original.subCategory && <div className="mt-0.5 text-[11px] text-muted">{row.original.subCategory}</div>}
        </div>
      ),
    },
    { id: "category", header: "Category", size: 170, cell: ({ row }) => <span className="text-fg-2">{row.original.category}</span> },
    { id: "scope", header: "Scope", size: 90, cell: ({ row }) => <Badge tone="outline" className="whitespace-nowrap">{row.original.scope}</Badge> },
    {
      id: "mapping", header: "ArC mapping (IR)", enableSorting: false, size: 220,
      cell: ({ row }) => (
        <div className="min-w-[200px] space-y-1">
          {row.original.mappings.map((m, i) =>
            m.requirement ? (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <Badge tone={m.mappingType === "PRIMARY" ? "accent" : "outline"}>{m.mappingType === "PRIMARY" ? "P" : "S"}</Badge>
                <Mono className="text-[11px]">IR {m.requirement.requirementId}</Mono>
                <span className="truncate text-fg-2">{m.requirement.name?.replace(/^IRM - /, "")}</span>
              </div>
            ) : (
              <Tooltip key={i} content={m.rawValue}>
                <div className="flex items-center gap-1.5 text-xs"><Badge tone="warning">{m.mappingType === "PRIMARY" ? "P" : "S"}</Badge><span className="truncate text-warning">Unresolved value</span></div>
              </Tooltip>
            ),
          )}
        </div>
      ),
    },
    {
      id: "citations", header: "Citations", enableSorting: false, size: 80,
      cell: ({ row }) => <span className="tabular text-fg-2">{formatNumber(row.original.mappings.reduce((n, m) => n + (m.requirement?._count.citations ?? 0), 0))}</span>,
    },
    {
      id: "artefacts", header: "Test / evidence", enableSorting: false, size: 110,
      cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted tabular">{row.original._count.testProcedures} TP · {row.original._count.evidence} EV</span>,
    },
  ], []);

  const active = [s.q, s.category, s.scope, s.prefix, s.mapping].some(Boolean);
  return (
    <Page>
      <PageHeader
        title="Internal CCF Mapping"
        description="GSK Common Control Framework v2 controls from the authoritative “CCFv2 (Metadata)” sheet. Each control maps to ArC integrated requirements, which trace back to framework citations."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search control name, title, statement or IR ID…" className="pl-8" aria-label="Search controls" />
          </div>
          <Select value={s.category} onChange={(v) => set({ category: v })} allLabel="All categories" options={(facets.data?.categories ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} triggerClassName="min-w-[180px]" aria-label="Category" />
          <Select value={s.scope} onChange={(v) => set({ scope: v })} allLabel="All scopes" options={(facets.data?.scopes ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Scope" />
          <Select value={s.prefix} onChange={(v) => set({ prefix: v })} allLabel="All domains" options={(facets.data?.prefixes ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Domain prefix" />
          <Select
            value={s.mapping} onChange={(v) => set({ mapping: v })} allLabel="Any mapping state"
            options={[
              { value: "mapped", label: "Mapped to an IR" },
              { value: "secondary", label: "Has secondary mapping" },
              { value: "unresolved", label: "Unresolved mapping value" },
              { value: "conflict", label: "Working sheet differs" },
            ]}
            aria-label="Mapping state"
          />
          {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", category: "", scope: "", prefix: "", mapping: "" }); }}><X /> Clear</Button>}
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{list.data ? `${formatNumber(list.data.total)} controls` : "…"} · P = primary “ARC Mapping”, S = “Secondary ArC Mapping”</div>
        <DataTable
          columns={columns}
          data={list.data?.items}
          total={list.data?.total}
          page={page}
          onPageChange={(p) => set({ page: String(p) })}
          sort={{ id: s.sort, desc: s.dir === "desc" }}
          onSortChange={(x) => set({ sort: x?.id ?? "controlName", dir: x?.desc ? "desc" : "asc" })}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/controls/${encodeURIComponent(r.controlName)}`)}
        />
      </Card>
    </Page>
  );
}
