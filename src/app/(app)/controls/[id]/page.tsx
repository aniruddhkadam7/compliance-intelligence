import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Page, PageHeader, StatStrip } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import type { TraceEdge, TraceNode } from "@/components/graph/trace-graph";
import { getControl, type ControlDetail } from "@/lib/queries/controls";
import { ControlTabs } from "./tabs";

export const dynamic = "force-dynamic";

/** Framework → Obligation → Control, from authoritative mappings only. */
function buildTrace(c: ControlDetail) {
  // Individual obligation nodes only when the trace is small; otherwise one summary node per framework.
  const PER_FRAMEWORK = c.trace.length <= 4 ? 3 : 0;
  const control = `k:${c.id}`;
  const nodes: TraceNode[] = [{ id: control, kind: "control", label: c.controlName, sublabel: c.title ?? undefined, emphasis: true }];
  const edges: TraceEdge[] = [];
  const seen = new Set<string>();
  const add = (n: TraceNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  for (const fw of c.trace) {
    // One entry per obligation; secondary only when the obligation is reached solely by a secondary mapping.
    const obligations = [...new Map(fw.citations.sort((x, y) => (x.mappingType === "PRIMARY" ? -1 : 1) - (y.mappingType === "PRIMARY" ? -1 : 1)).map((o) => [o.id, o])).values()];
    add({ id: `f:${fw.id}`, kind: "framework", label: fw.short, sublabel: `${obligations.length} obligation${obligations.length === 1 ? "" : "s"}`, href: `/frameworks/${fw.id}` });
    obligations.slice(0, PER_FRAMEWORK).forEach((o) => {
      add({ id: `c:${o.id}`, kind: "citation", label: o.sectionName.split(" - ").slice(-1)[0], sublabel: `Obligation ${o.sourceSectionId}`, href: `/citations?citation=${o.sourceSectionId}` });
      edges.push({ from: `f:${fw.id}`, to: `c:${o.id}` }, { from: `c:${o.id}`, to: control, dashed: o.mappingType === "SECONDARY" });
    });
    const rest = obligations.length - PER_FRAMEWORK;
    if (rest > 0) {
      const id = `m:${fw.id}`;
      add({
        id, kind: "more", label: PER_FRAMEWORK ? `+${rest} more obligations` : `${rest} obligation${rest > 1 ? "s" : ""}`,
        sublabel: fw.short, href: `/controls/${encodeURIComponent(c.controlName)}?tab=trace&q=${encodeURIComponent(fw.short)}`,
      });
      edges.push({ from: `f:${fw.id}`, to: id }, { from: id, to: control });
    }
  }
  return { nodes, edges };
}

export default async function ControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getControl(decodeURIComponent(id));
  if (!c) notFound();
  const trace = buildTrace(c);
  const obligations = new Set(c.trace.flatMap((f) => f.citations.map((o) => o.id))).size;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Internal CCF Mapping", href: "/controls" }, { label: c.controlName }]}
        title={<span className="flex items-center gap-2"><span className="font-mono">{c.controlName}</span></span>}
        description={c.title ?? undefined}
        meta={
          <>
            {c.category && <Badge>{c.category}</Badge>}
            {c.subCategory && <Badge tone="outline">{c.subCategory}</Badge>}
            {c.scope && <Badge tone="info">{c.scope}</Badge>}
            {c.technicalType && <Badge tone="outline">{c.technicalType}</Badge>}
            {c.gskReviewStatus && <Badge tone={c.gskReviewStatus === "GSK approved" ? "success" : "neutral"}>{c.gskReviewStatus}</Badge>}
          </>
        }
      />
      {c.conflict && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Mapping differs between worksheets.</span> The two control sheets in the uploaded workbook disagree on this control&apos;s mapping.
            The authoritative sheet&apos;s value is used everywhere, and neither value has been changed.
          </div>
        </div>
      )}
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "Mapped obligations", value: obligations, sub: "Regulatory obligations linked to this control" },
          { label: "Frameworks reached", value: c.trace.length, sub: "Distinct frameworks" },
          { label: "Test procedures", value: c.testProcedures.length, sub: "Across workbook columns" },
          { label: "Evidence statements", value: c.evidence.length, sub: "Across workbook columns" },
        ]}
      />
      <ControlTabs control={JSON.parse(JSON.stringify(c))} trace={trace} />
    </Page>
  );
}
