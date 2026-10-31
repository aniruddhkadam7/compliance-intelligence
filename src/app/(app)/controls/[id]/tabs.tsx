"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileCheck2, FileText, GitBranch, Link2, Search, Table2, XCircle, CircleDashed } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, KeyValue, LongText, Mono, Provenance, SectionTitle } from "@/components/common";
import { GraphLegend, TraceGraph, type TraceEdge, type TraceNode } from "@/components/graph/trace-graph";
import { EVIDENCE_KIND_LABELS, TP_KIND_LABELS } from "@/lib/labels";
import type { ControlDetail } from "@/lib/queries/controls";
import { useUrlState } from "@/lib/client/hooks";

export function ControlTabs({ control: c, trace }: { control: ControlDetail; trace: { nodes: TraceNode[]; edges: TraceEdge[] } }) {
  const [s, set] = useUrlState({ tab: "trace" });
  return (
    <Tabs value={s.tab} onValueChange={(v) => set({ tab: v })}>
      <TabsList className="mb-4">
        <TabsTrigger value="trace"><GitBranch /> Traceability</TabsTrigger>
        <TabsTrigger value="details"><FileText /> Control details</TabsTrigger>
        <TabsTrigger value="tests"><ClipboardCheck /> Test procedures <Badge className="ml-0.5">{c.testProcedures.length}</Badge></TabsTrigger>
        <TabsTrigger value="evidence"><FileCheck2 /> Evidence <Badge className="ml-0.5">{c.evidence.length}</Badge></TabsTrigger>
        <TabsTrigger value="refs"><Link2 /> Framework references <Badge className="ml-0.5">{c.frameworkReferences.length}</Badge></TabsTrigger>
        <TabsTrigger value="source"><Table2 /> Source record</TabsTrigger>
      </TabsList>
      <TabsContent value="trace"><Traceability c={c} trace={trace} /></TabsContent>
      <TabsContent value="details"><Details c={c} /></TabsContent>
      <TabsContent value="tests"><TextRecords items={c.testProcedures} labels={TP_KIND_LABELS} empty="No test procedures recorded for this control." /></TabsContent>
      <TabsContent value="evidence"><TextRecords items={c.evidence} labels={EVIDENCE_KIND_LABELS} empty="No evidence statements recorded for this control." /></TabsContent>
      <TabsContent value="refs"><References c={c} /></TabsContent>
      <TabsContent value="source"><SourceRecord c={c} /></TabsContent>
    </Tabs>
  );
}

function Traceability({ c, trace }: { c: ControlDetail; trace: { nodes: TraceNode[]; edges: TraceEdge[] } }) {
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => c.trace.flatMap((fw) => fw.citations.map((ct) => ({ ...ct, framework: fw }))).filter((r) =>
      !q || `${r.sectionName} ${r.sourceSectionId} ${r.framework.short} ${r.requirementId}`.toLowerCase().includes(q.toLowerCase())),
    [c.trace, q],
  );
  const authoritative = c.mappings.filter((m) => m.authoritative);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Relationship graph"
            description={c.trace.length <= 4 ? "Select a node to open it. Up to three citations are shown per framework; “+N more” opens the full list." : "Select a node to open it. With many frameworks, citations are summarised per framework; select a summary to list them."}
          />
          <CardBody className="space-y-3">
            {trace.nodes.length > 1 ? <TraceGraph nodes={trace.nodes} edges={trace.edges} /> : <EmptyState title="No resolvable mapping" description="This control has no authoritative mapping to an integrated requirement." />}
            <GraphLegend />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Integrated requirement associations" description="From “ARC Mapping” and “Secondary ArC Mapping”" />
            <ul className="divide-y divide-border">
              {authoritative.map((m) => (
                <li key={m.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={m.mappingType === "PRIMARY" ? "accent" : "outline"}>{m.mappingType.toLowerCase()}</Badge>
                    {m.requirement ? (
                      <Link href={`/requirements/${m.requirement.requirementId}`} className="text-[13px] font-medium text-fg hover:text-accent">IR {m.requirement.requirementId} · {m.requirement.name}</Link>
                    ) : (
                      <span className="text-[13px] text-warning">Not a Requirement ID</span>
                    )}
                  </div>
                  {m.requirement ? (
                    <p className="mt-1 text-xs text-muted">{m.requirement.riskTopic} · {m.requirement.citationCount} citations</p>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-fg-2">“{m.rawValue}”</p>
                  )}
                  <div className="mt-1.5"><Provenance sheet={m.sourceSheet} column={m.sourceColumn} /></div>
                </li>
              ))}
            </ul>
          </Card>
          <QualityIndicators c={c} />
        </div>
      </div>
      <Card>
        <CardHeader
          title="Traced citations"
          description="Every framework citation reachable through this control's authoritative IR mappings"
          actions={
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter citations…" className="h-7 pl-8" />
            </div>
          }
        />
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-2">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Framework</th><th className="px-3 py-2">Citation ID</th><th className="px-3 py-2">Source section</th><th className="px-3 py-2">Via IR</th><th className="px-4 py-2">Mapping</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-2 text-fg-2">{r.framework.short}</td>
                  <td className="px-3 py-2"><Link href={`/citations?citation=${r.sourceSectionId}`} className="font-mono text-xs text-accent hover:underline">{r.sourceSectionId}</Link></td>
                  <td className="px-3 py-2 text-[13px] text-fg">{r.sectionName}</td>
                  <td className="whitespace-nowrap px-3 py-2"><Mono className="text-[11px]">IR {r.requirementId}</Mono></td>
                  <td className="px-4 py-2"><Badge tone={r.mappingType === "PRIMARY" ? "accent" : "outline"}>{r.mappingType.toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No citations" />}
        </div>
      </Card>
    </div>
  );
}

/** Indicators derived only from fields present in the workbook. */
function QualityIndicators({ c }: { c: ControlDetail }) {
  const primary = c.mappings.find((m) => m.authoritative && m.mappingType === "PRIMARY");
  const items: { ok: boolean | null; label: string; detail: string }[] = [
    { ok: !!primary?.requirement, label: "Primary mapping resolves to an IR", detail: primary ? (primary.requirement ? `IR ${primary.requirement.requirementId}` : `“${primary.rawValue}”`) : "No primary value" },
    { ok: !c.conflict, label: "Worksheets agree on primary mapping", detail: c.conflict ? `Working sheet: IR ${c.conflict.working}` : "Same value on both sheets" },
    { ok: c.gskReviewStatus ? c.gskReviewStatus === "GSK approved" : null, label: "GSK review status", detail: c.gskReviewStatus ?? "Not stated" },
    { ok: c.testProcedures.some((t) => t.kind === "CCF_V2" || t.kind.startsWith("ARC")), label: "CCF v2 / ArC test procedure present", detail: `${c.testProcedures.length} test procedure records` },
    { ok: c.evidence.some((e) => e.kind === "GO_LIVE"), label: "Go-live evidence defined", detail: c.evidence.some((e) => e.kind === "GO_LIVE") ? "Recommended Evidences (Go-live)" : "Column empty" },
  ];
  return (
    <Card>
      <CardHeader title="Mapping quality indicators" description="Derived only from workbook fields; no scores are inferred" />
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2.5 px-4 py-2">
            {i.ok === null ? <CircleDashed className="mt-0.5 size-3.5 text-subtle" /> : i.ok ? <CheckCircle2 className="mt-0.5 size-3.5 text-success" /> : <XCircle className="mt-0.5 size-3.5 text-warning" />}
            <div className="min-w-0"><div className="text-[13px] text-fg">{i.label}</div><div className="truncate text-[11px] text-muted">{i.detail}</div></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Details({ c }: { c: ControlDetail }) {
  const blocks: [string, string | null][] = [
    ["Control Objective", c.objective],
    ["Control Activity Statement (CCFv2.0)", c.activityStatementV2],
    ["Control Activity Statement (CCFv1.0)", c.activityStatementV1],
    ["ArC Activity Statement", c.arcActivityStatement],
    ["Monitoring Statements", c.monitoringStatements],
    ["Monitoring criteria", c.monitoringCriteria],
    ["Standards Control Mapping (CCFv2.0)", c.standardsControlMapping],
    ["Product Implementation Guidance", c.productImplementation],
    ["ArC Mapping Risk Statement", c.arcRiskStatement],
    ["ArC Mapping Risk Objective", c.arcRiskObjective],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardBody className="space-y-5">
          {blocks.map(([label, text]) => (
            <div key={label}>
              <SectionTitle>{label}</SectionTitle>
              <LongText text={text} lines={5} />
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Attributes" />
        <CardBody>
          <KeyValue
            cols={1}
            items={[
              { label: "Scope (GRC/CSO/OT/DCJ)", value: c.scope },
              { label: "Coverage in ISMS Standards", value: c.coverageInIsms },
              { label: "Mapped ISMS Standard Sub-Controls", value: c.mappedIsmsSubControls },
              { label: "Technical/Non-technical Control", value: c.technicalType },
              { label: "Product Team Facing? (CCFv2.0)", value: c.productTeamFacing },
              { label: "Org. Level/Product Level (Proposed) v2.0", value: c.orgLevel },
              { label: "Related GSK Standard", value: c.relatedGskStandard },
              { label: "Tools/Documents (CCF V2)", value: c.toolsDocuments },
              { label: "GSK Assignee", value: c.gskAssignee },
              { label: "GSK Comments", value: c.gskComments },
              { label: "Team Comments", value: c.teamComments },
              { label: "Notes / Comments / Feedback", value: c.notes ? <LongText text={c.notes} lines={4} /> : null },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function TextRecords({ items, labels, empty }: { items: { id: string; kind: string; text: string; sourceSheet: string; sourceColumn: string }[]; labels: Record<string, string>; empty: string }) {
  if (!items.length) return <Card><EmptyState title={empty} description="Placeholder values such as “NA” are not imported as records." /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((t) => (
        <Card key={t.id}>
          <CardHeader title={labels[t.kind] ?? t.kind} actions={<Provenance sheet={t.sourceSheet} column={t.sourceColumn} />} />
          <CardBody><LongText text={t.text} lines={14} /></CardBody>
        </Card>
      ))}
    </div>
  );
}

function References({ c }: { c: ControlDetail }) {
  if (!c.frameworkReferences.length)
    return <Card><EmptyState title="No direct framework references" description="The working sheet's standards crosswalk columns are empty for this control." /></Card>;
  return (
    <Card>
      <CardHeader title="Direct standards references" description="Crosswalk columns stated per control on the “Metadata(CCFv2)” working sheet. These are separate from the ArC citation trace." />
      <table className="w-full text-left">
        <thead><tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted"><th className="px-4 py-2">Column</th><th className="px-3 py-2">References</th></tr></thead>
        <tbody>
          {c.frameworkReferences.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 align-top">
              <td className="whitespace-nowrap px-4 py-2.5 font-medium text-fg">{r.columnName}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">{r.tokens.map((t, i) => <Badge key={i} tone="outline" className="font-mono">{t}</Badge>)}</div>
                {r.tokens.join(", ") !== r.referenceRaw.trim() && <div className="mt-1 whitespace-pre-wrap text-[11px] text-muted">Original: {r.referenceRaw}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SourceRecord({ c }: { c: ControlDetail }) {
  const [which, setWhich] = useState<"raw" | "workingRaw">("raw");
  const record = (which === "raw" ? c.raw : c.workingRaw) as Record<string, string | null> | null;
  return (
    <Card>
      <CardHeader
        title="Original worksheet row"
        description="Every column exactly as it appears in the workbook (headers preserved)"
        actions={
          <div className="flex rounded-md border border-border p-0.5">
            {(["raw", "workingRaw"] as const).map((k) => (
              <button key={k} onClick={() => setWhich(k)} className={`rounded-[4px] px-2 py-1 text-xs font-medium ${which === k ? "bg-surface-3 text-fg" : "text-muted"}`}>
                {k === "raw" ? "CCFv2 (Metadata)" : "Metadata(CCFv2)"}
              </button>
            ))}
          </div>
        }
      />
      {which === "raw" && <div className="border-b border-border px-4 py-2"><Provenance sheet={c.sourceSheet} row={c.sourceRow} /></div>}
      <table className="w-full text-left">
        <tbody>
          {record && Object.entries(record).filter(([k]) => !k.startsWith("(unlabelled")).map(([k, v]) => (
            <tr key={k} className="border-b border-border last:border-0 align-top">
              <th className="w-[280px] px-4 py-2 text-xs font-medium text-muted"><span className="whitespace-pre-wrap">“{k}”</span></th>
              <td className="px-3 py-2">{v ? <LongText text={v} lines={3} /> : <span className="text-subtle">empty</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
