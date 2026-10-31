"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Grid3x3, Info, ListX, Network, Rows3 } from "lucide-react";
import { Page, PageHeader } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { formatNumber } from "@/lib/utils";
import { MatrixView, type Matrix } from "./matrix";
import { PairsView } from "./pairs";
import { GraphView } from "./graph-view";
import { UnmappedView } from "./unmapped";

export function MappingExplorer() {
  const [s, set] = useUrlState({ tab: "pairs", source: "", target: "", status: "all", q: "", page: "1" });
  const matrix = useQuery({ queryKey: ["mapping-matrix"], queryFn: () => apiGet<Matrix>("/api/mappings?view=matrix") });
  const fws = matrix.data?.frameworks ?? [];
  const self = new Map((matrix.data?.cells ?? []).filter((c) => c.a === c.b).map((c) => [c.a, c.shared]));
  // Default source: NIST CSF 2.0 when present, else the first framework.
  const source = s.source || fws.find((f) => f.short === "NIST CSF 2.0")?.id || fws[0]?.id || "";
  const options = fws.map((f) => ({ value: f.id, label: f.short, hint: `${formatNumber(self.get(f.id) ?? 0)} IRs` }));
  const needsPair = s.tab === "pairs" || s.tab === "graph";

  return (
    <Page>
      <PageHeader
        title="Cross-Framework Mapping"
        description="How requirements in different frameworks relate. The workbook does not state framework-to-framework equivalence. Two sources are related when their citations map to the same ArC integrated requirement. No relationship is inferred beyond that."
      />
      <Tabs value={s.tab} onValueChange={(v) => set({ tab: v })}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
          <TabsList className="border-0">
            <TabsTrigger value="pairs"><Rows3 /> Mapping table</TabsTrigger>
            <TabsTrigger value="graph"><Network /> Relationship graph</TabsTrigger>
            <TabsTrigger value="matrix"><Grid3x3 /> Coverage matrix</TabsTrigger>
            <TabsTrigger value="unmapped"><ListX /> Unmapped requirements</TabsTrigger>
          </TabsList>
          {needsPair && (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Select value={source} onChange={(v) => set({ source: v, page: "1" })} options={options} placeholder="Source framework" triggerClassName="min-w-[210px]" aria-label="Source framework" />
              <Button variant="ghost" size="icon-sm" aria-label="Swap source and target" disabled={!s.target} onClick={() => set({ source: s.target, target: source })}><ArrowLeftRight /></Button>
              <Select value={s.target} onChange={(v) => set({ target: v })} allLabel="Any target framework" options={options.filter((o) => o.value !== source)} placeholder="Target framework" triggerClassName="min-w-[210px]" aria-label="Target framework" />
            </div>
          )}
        </div>
        {needsPair && (
          <p className="-mt-2 mb-3 flex items-center gap-1.5 text-[11px] text-muted"><Info className="size-3" /> Relationship path: Framework → Citation → Integrated Requirement → CCF control. Only authoritative CCF mappings are drawn.</p>
        )}
        <TabsContent value="pairs">{source && <PairsView source={source} target={s.target} status={s.status} q={s.q} page={Number(s.page) || 1} set={set} />}</TabsContent>
        <TabsContent value="graph">{source && <GraphView source={source} target={s.target} />}</TabsContent>
        <TabsContent value="matrix"><MatrixView matrix={matrix.data} loading={matrix.isLoading} onSelect={(a, b) => set({ tab: "pairs", source: a, target: b })} /></TabsContent>
        <TabsContent value="unmapped"><UnmappedView /></TabsContent>
      </Tabs>
    </Page>
  );
}
