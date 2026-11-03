"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { LayoutGrid, Quote, Search, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mono } from "@/components/common";
import { DataTable } from "@/components/data-table";
import { CitationTable } from "@/components/citations/citation-table";
import { CitationDetailSheet } from "@/components/citations/citation-detail";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";

interface ControlRow { id: string; controlName: string; title: string | null; category: string | null; requirements: number; citations: number }

export function FrameworkTabs({ frameworkId, overview }: { frameworkId: string; overview: React.ReactNode }) {
  const navigate = useNavigate();
  const [s, set] = useUrlState({ tab: "overview", q: "", page: "1", sort: "", dir: "asc", citation: "" });
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 300);
  useEffect(() => {
    if (dq !== s.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const page = Number(s.page) || 1;
  const controls = useQuery({
    queryKey: ["fw-controls", frameworkId, s.q, page],
    queryFn: () => apiGet<{ items: ControlRow[]; total: number }>(`/api/frameworks/${frameworkId}${qs({ view: "controls", q: s.q, page })}`),
    enabled: s.tab === "controls",
    placeholderData: keepPreviousData,
  });

  const controlCols = useMemo<ColumnDef<ControlRow, unknown>[]>(() => [
    { id: "controlName", header: "Control", size: 120, enableSorting: false, cell: ({ row }) => <Mono className="font-medium text-fg">{row.original.controlName}</Mono> },
    { id: "title", header: "Common control title", enableSorting: false, cell: ({ row }) => <span className="line-clamp-2 min-w-[320px] text-fg-2">{row.original.title}</span> },
    { id: "category", header: "Category", enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap text-fg-2">{row.original.category}</span> },
    { id: "citations", header: "Obligations", size: 100, enableSorting: false, cell: ({ row }) => <span className="tabular">{row.original.citations}</span> },
  ], []);

  const searchBox = (placeholder: string) => (
    <div className="border-b border-border p-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8" />
      </div>
    </div>
  );

  return (
    <Tabs value={s.tab} onValueChange={(v) => { setQ(""); set({ tab: v, q: "" }); }}>
      <TabsList className="mb-4">
        <TabsTrigger value="overview"><LayoutGrid /> Overview</TabsTrigger>
        <TabsTrigger value="citations"><Quote /> Regulatory obligations</TabsTrigger>
        <TabsTrigger value="controls"><ShieldCheck /> Mapped controls</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="citations">
        <Card>
          {searchBox("Search obligation ID or requirement description…")}
          <CitationTable
            hideFramework
            query={{ frameworkId, q: s.q, page, sort: s.sort, dir: s.dir }}
            onPage={(p) => set({ page: String(p) })}
            onSort={(x) => set({ sort: x?.id ?? "", dir: x?.desc ? "desc" : "asc" })}
            onOpen={(id) => set({ citation: id, page: s.page })}
            selectedId={s.citation}
          />
        </Card>
        <CitationDetailSheet citationId={s.citation || null} onClose={() => set({ citation: "", page: s.page })} onOpen={(id) => set({ citation: id, page: s.page })} />
      </TabsContent>
      <TabsContent value="controls">
        <Card>
          {searchBox("Search controls…")}
          <DataTable
            columns={controlCols}
            data={controls.data?.items}
            total={controls.data?.total}
            page={page}
            onPageChange={(p) => set({ page: String(p) })}
            loading={controls.isLoading}
            error={controls.error}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/controls/${encodeURIComponent(r.controlName)}`)}
          />
        </Card>
      </TabsContent>
    </Tabs>
  );
}
