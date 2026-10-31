import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Page, PageHeader, StatStrip } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import type { TraceEdge, TraceNode } from "@/components/graph/trace-graph";
import { getControl, type ControlDetail } from "@/lib/queries/controls";
import { ControlTabs } from "./tabs";

export const dynamic = "force-dynamic";

/** Framework → Citation → IR → Control, from authoritative mappings only. */
function buildTrace(c: ControlDetail) {
  // Individual citation nodes only when the trace is small; otherwise one summary node per framework.
  const CITATIONS_PER_FRAMEWORK = c.trace.length <= 4 ? 3 : 0;
  const nodes: TraceNode[] = [{ id: `k:${c.id}`, kind: "control", label: c.controlName, sublabel: c.title ?? undefined, emphasis: true }];
  const edges: TraceEdge[] = [];
  const seen = new Set<string>();
  const add = (n: TraceNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  for (const m of c.mappings.filter((x) => x.authoritative && x.requirement)) {
    const r = m.requirement!;
    add({ id: `r:${r.id}`, kind: "requirement", label: `IR ${r.requirementId}`, sublabel: r.name ?? undefined, href: `/requirements/${r.requirementId}` });
    edges.push({ from: `r:${r.id}`, to: `k:${c.id}`, dashed: m.mappingType === "SECONDARY" });
  }
  for (const fw of c.trace) {
    add({ id: `f:${fw.id}`, kind: "framework", label: fw.short, sublabel: `${fw.citations.length} citation${fw.citations.length === 1 ? "" : "s"}`, href: `/frameworks/${fw.id}` });
    const byReq = new Map<string, typeof fw.citations>();
    fw.citations.forEach((ct) => byReq.set(ct.requirementId, [...(byReq.get(ct.requirementId) ?? []), ct]));
    for (const [reqId, cits] of byReq) {
      const req = c.mappings.find((m) => m.requirement?.requirementId === reqId)!.requirement!;
      cits.slice(0, CITATIONS_PER_FRAMEWORK).forEach((ct) => {
        add({ id: `c:${ct.id}`, kind: "citation", label: ct.sectionName.split(" - ").slice(-1)[0], sublabel: `Section ${ct.sourceSectionId}`, href: `/citations?citation=${ct.sourceSectionId}` });
        edges.push({ from: `f:${fw.id}`, to: `c:${ct.id}` }, { from: `c:${ct.id}`, to: `r:${req.id}` });
      });
      if (cits.length > CITATIONS_PER_FRAMEWORK || CITATIONS_PER_FRAMEWORK === 0) {
        const id = `m:${fw.id}:${req.id}`;
        const n = cits.length - CITATIONS_PER_FRAMEWORK;
        add({
          id, kind: "more", label: CITATIONS_PER_FRAMEWORK ? `+${n} more citations` : `${n} citation${n > 1 ? "s" : ""}`,
          sublabel: `${fw.short} · IR ${reqId}`, href: `/citations?frameworkId=${fw.id}&requirementId=${reqId}`,
        });
        edges.push({ from: `f:${fw.id}`, to: id }, { from: id, to: `r:${req.id}` });
      }
    }
  }
  return { nodes, edges };
}

export default async function ControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getControl(decodeURIComponent(id));
  if (!c) notFound();
  const trace = buildTrace(c);
  const authoritative = c.mappings.filter((m) => m.authoritative);

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
            <span className="font-medium">Mapping differs between worksheets.</span> The authoritative sheet “CCFv2 (Metadata)” maps this control to IR {c.conflict.authoritative}.
            The working sheet “Metadata(CCFv2)” maps it to IR {c.conflict.working}. The authoritative value is used everywhere, and neither value has been changed.
          </div>
        </div>
      )}
      <StatStrip
        className="mb-4 xl:grid-cols-5"
        items={[
          { label: "Integrated requirements", value: authoritative.filter((m) => m.requirement).length, sub: `${authoritative.filter((m) => m.mappingType === "PRIMARY").length} primary · ${authoritative.filter((m) => m.mappingType === "SECONDARY").length} secondary` },
          { label: "Citations traced", value: c.citationTotal, sub: "Through mapped IRs" },
          { label: "Frameworks reached", value: c.trace.length, sub: "Distinct authoritative sources" },
          { label: "Test procedures", value: c.testProcedures.length, sub: "Across workbook columns" },
          { label: "Evidence statements", value: c.evidence.length, sub: "Across workbook columns" },
        ]}
      />
      <ControlTabs control={JSON.parse(JSON.stringify(c))} trace={trace} />
    </Page>
  );
}
