"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/common";
import { GraphLegend, TraceGraph, type TraceEdge, type TraceNode } from "@/components/graph/trace-graph";
import { apiGet, qs } from "@/lib/client/api";

interface GraphData {
  frameworks: { id: string; short: string; name: string }[];
  requirements: {
    id: string; requirementId: string; name: string | null;
    citations: { id: string; sourceSectionId: string; sectionName: string; frameworkId: string }[];
    controls: { id: string; controlName: string; title: string | null; mappingType: string }[];
  }[];
}

const PER_FRAMEWORK = 2;

export function GraphView({ source, target }: { source: string; target: string }) {
  const [limit, setLimit] = useState("10");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["graph", source, target, limit],
    queryFn: () => apiGet<GraphData>(`/api/mappings${qs({ view: "graph", source, target, limit })}`),
  });

  const graph = useMemo(() => {
    if (!data) return null;
    const nodes: TraceNode[] = [];
    const edges: TraceEdge[] = [];
    const seen = new Set<string>();
    const add = (n: TraceNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
    for (const f of data.frameworks) add({ id: `f:${f.id}`, kind: "framework", label: f.short, sublabel: f.id === source ? "Source" : "Target", href: `/frameworks/${f.id}`, emphasis: f.id === source });
    for (const r of data.requirements) {
      add({ id: `r:${r.id}`, kind: "requirement", label: `IR ${r.requirementId}`, sublabel: r.name ?? undefined, href: `/requirements/${r.requirementId}` });
      for (const f of data.frameworks) {
        const cits = r.citations.filter((c) => c.frameworkId === f.id);
        cits.slice(0, PER_FRAMEWORK).forEach((c) => {
          add({ id: `c:${c.id}`, kind: "citation", label: c.sectionName.split(" - ").slice(-1)[0], sublabel: `${f.short} · ${c.sourceSectionId}`, href: `/citations?citation=${c.sourceSectionId}` });
          edges.push({ from: `f:${f.id}`, to: `c:${c.id}` }, { from: `c:${c.id}`, to: `r:${r.id}` });
        });
        if (cits.length > PER_FRAMEWORK) {
          const id = `m:${f.id}:${r.id}`;
          add({ id, kind: "more", label: `+${cits.length - PER_FRAMEWORK} more`, sublabel: f.short, href: `/citations?frameworkId=${f.id}&requirementId=${r.requirementId}` });
          edges.push({ from: `f:${f.id}`, to: id }, { from: id, to: `r:${r.id}` });
        }
      }
      for (const k of r.controls) {
        add({ id: `k:${k.id}`, kind: "control", label: k.controlName, sublabel: k.title ?? undefined, href: `/controls/${encodeURIComponent(k.controlName)}` });
        edges.push({ from: `r:${r.id}`, to: `k:${k.id}`, dashed: k.mappingType === "SECONDARY" });
      }
    }
    return { nodes, edges };
  }, [data, source]);

  return (
    <Card>
      <CardHeader
        title="Relationship graph"
        description={target ? "Requirements cited by both frameworks, with their citations and mapped CCF controls" : "Requirements cited by the source framework, with their mapped CCF controls. Choose a target to compare two frameworks."}
        actions={
          <div className="flex items-center gap-3">
            <GraphLegend />
            <Select value={limit} onChange={setLimit} options={["5", "10", "20", "30"].map((v) => ({ value: v, label: `${v} requirements` }))} triggerClassName="min-w-[150px]" aria-label="Requirements shown" />
          </div>
        }
      />
      <CardBody>
        {isLoading && <Skeleton className="h-[520px]" />}
        {!!error && <ErrorState error={error} onRetry={refetch} />}
        {graph && graph.nodes.length <= data!.frameworks.length && <EmptyState title="No shared requirements" description="These frameworks have no integrated requirements in common in the workbook." />}
        {graph && graph.nodes.length > data!.frameworks.length && <TraceGraph nodes={graph.nodes} edges={graph.edges} height={600} />}
        <p className="mt-2 text-[11px] text-muted">Showing the first {limit} requirements by ID. Citations are capped at {PER_FRAMEWORK} per framework per requirement. Use the mapping table for the complete list.</p>
      </CardBody>
    </Card>
  );
}
