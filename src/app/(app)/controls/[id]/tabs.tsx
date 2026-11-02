"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileCheck2, FileText, GitBranch, Link2, Search, Table2, XCircle, CircleDashed } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, KeyValue, LongText, Provenance, SectionTitle } from "@/components/common";
import { GraphLegend, TraceGraph } from "@/components/graph/trace-graph";
import { Button } from "@/components/ui/button";
import { buildTrace } from "./trace";
import { EVIDENCE_KIND_LABELS, mappingLabel, TP_KIND_LABELS } from "@/lib/labels";
import type { ControlDetail } from "@/lib/queries/controls";
import { useUrlState } from "@/lib/client/hooks";

export function ControlTabs({ control: c }: { control: ControlDetail }) {
  const [s, set] = useUrlState({ tab: "trace", q: "" });
  return (
    <Tabs value={s.tab} onValueChange={(v) => set({ tab: v })}>
      <TabsList className="mb-4">
        <TabsTrigger value="trace"><GitBranch /> Traceability</TabsTrigger>
        <TabsTrigger value="details"><FileText /> Control details</TabsTrigger>
        <TabsTrigger value="tests"><ClipboardCheck /> Test procedures <Badge className="ml-0.5">{c.testProcedures.filter((t) => !t.kind.startsWith("ARC_")).length}</Badge></TabsTrigger>
        <TabsTrigger value="evidence"><FileCheck2 /> Evidence <Badge className="ml-0.5">{c.evidence.length}</Badge></TabsTrigger>
        <TabsTrigger value="refs"><Link2 /> Framework references <Badge className="ml-0.5">{c.frameworkReferences.length}</Badge></TabsTrigger>
        <TabsTrigger value="source"><Table2 /> Source record</TabsTrigger>
      </TabsList>
      <TabsContent value="trace"><Traceability c={c} initialQuery={s.q} /></TabsContent>
      <TabsContent value="details"><Details c={c} /></TabsContent>
      <TabsContent value="tests"><TextRecords items={c.testProcedures.filter((t) => !t.kind.startsWith("ARC_"))} labels={TP_KIND_LABELS} empty="No test procedures recorded for this control." /></TabsContent>
      <TabsContent value="evidence"><TextRecords items={c.evidence} labels={EVIDENCE_KIND_LABELS} empty="No evidence statements recorded for this control." /></TabsContent>
      <TabsContent value="refs"><References c={c} /></TabsContent>
      <TabsContent value="source"><SourceRecord c={c} /></TabsContent>
    </Tabs>
  );
}

function Traceability({ c, initialQuery }: { c: ControlDetail; initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const trace = useMemo(() => buildTrace(c, expanded), [c, expanded]);
  const onAction = (action: string) => {
    if (action.startsWith("expand:")) setExpanded((x) => new Set(x).add(action.slice("expand:".length)));
  };
  // One row per obligation (an obligation reached by both mappings is listed as primary).
  const rows = useMemo(() => {
    const all = c.trace.flatMap((fw) => fw.citations.map((ct) => ({ ...ct, framework: fw })));
    const unique = [...new Map(all.sort((x, y) => (x.mappingType === "PRIMARY" ? -1 : 1) - (y.mappingType === "PRIMARY" ? -1 : 1)).map((r) => [r.id, r])).values()];
    return unique.filter((r) => !q || `${r.sectionName} ${r.sourceSectionId} ${r.framework.short}`.toLowerCase().includes(q.toLowerCase()));
  }, [c.trace, q]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Relationship graph"
            description={c.trace.length <= 4 ? "Select a node to open it. Up to three obligations are shown per framework; select “+N more” to expand the rest." : "Select a node to open it. Obligations are summarised per framework; select a summary to expand it."}
          />
          <CardBody className="space-y-3">
            {trace.nodes.length > 1 ? (
              <>
                {/* Remount on expand so the view refits to the new graph. */}
                <TraceGraph key={[...expanded].join(",")} nodes={trace.nodes} edges={trace.edges} onAction={onAction} />
                {expanded.size > 0 && <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>Collapse all</Button>}
              </>
            ) : <EmptyState title="No resolvable mapping" description="This control is not mapped to any regulatory obligation." />}
            <GraphLegend />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <QualityIndicators c={c} />
        </div>
      </div>
      <Card>
        <CardHeader
          title="Mapped regulatory obligations"
          description="Every obligation this control is mapped to, across all frameworks"
          actions={
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter obligations…" className="h-7 pl-8" />
            </div>
          }
        />
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-2">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Framework</th><th className="px-3 py-2">Obligation ID</th><th className="px-3 py-2">Requirement description</th><th className="px-4 py-2">Mapping</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-2 text-fg-2">{r.framework.short}</td>
                  <td className="px-3 py-2"><Link href={`/citations?citation=${r.sourceSectionId}`} className="font-mono text-xs text-accent hover:underline">{r.sourceSectionId}</Link></td>
                  <td className="px-3 py-2 text-[13px] text-fg">{r.sectionName}</td>
                  <td className="px-4 py-2"><Badge tone={r.mappingType === "SECONDARY" ? "outline" : "accent"}>{mappingLabel(r.mappingType)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No obligations" />}
        </div>
      </Card>
    </div>
  );
}

/** Indicators derived only from fields present in the workbook. */
function QualityIndicators({ c }: { c: ControlDetail }) {
  const items: { ok: boolean | null; label: string; detail: string }[] = [
    { ok: c.citationTotal > 0, label: "Control is mapped to obligations", detail: c.citationTotal ? `${c.citationTotal} obligations linked` : "No mapping recorded" },
    { ok: !c.conflict, label: "Workbook sheets agree on the mapping", detail: c.conflict ? "The two control sheets differ" : "Same value on both sheets" },
    { ok: c.gskReviewStatus ? c.gskReviewStatus === "GSK approved" : null, label: "Review status", detail: c.gskReviewStatus ?? "Not stated" },
    { ok: c.testProcedures.length > 0, label: "Test procedure present", detail: `${c.testProcedures.length} test procedure records` },
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
    ["Activity Statement (mapping)", c.arcActivityStatement],
    ["Monitoring Statements", c.monitoringStatements],
    ["Monitoring criteria", c.monitoringCriteria],
    ["Standards Control Mapping (CCFv2.0)", c.standardsControlMapping],
    ["Product Implementation Guidance", c.productImplementation],
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
              { label: "Related internal standard", value: c.relatedGskStandard },
              { label: "Tools/Documents (CCF V2)", value: c.toolsDocuments },
              { label: "Assignee", value: c.gskAssignee },
              { label: "Reviewer comments", value: c.gskComments },
              { label: "Team Comments", value: c.teamComments },
              { label: "Notes / Comments / Feedback", value: c.notes ? <LongText text={c.notes} lines={4} /> : null },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

interface TextRecord {
  id: string; kind: string; text: string; sourceSheet: string; sourceColumn: string;
  procedureId?: string | null;
  obligations?: { id: string; sourceSectionId: string; sectionName: string }[];
}

function TextRecords({ items, labels, empty }: { items: TextRecord[]; labels: Record<string, string>; empty: string }) {
  if (!items.length) return <Card><EmptyState title={empty} description="Placeholder values such as “NA” are not imported as records." /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((t) => (
        <Card key={t.id}>
          <CardHeader
            title={t.procedureId ? <span className="font-mono">{t.procedureId}</span> : labels[t.kind] ?? t.kind}
            description={t.procedureId ? labels[t.kind] : undefined}
            actions={<Provenance sheet={t.sourceSheet} column={t.sourceColumn} />}
          />
          <CardBody className="space-y-3">
            <LongText text={t.text} lines={14} />
            {t.obligations && t.kind === "PROCEDURE" && (
              <div>
                <SectionTitle>Mapped obligations ({t.obligations.length})</SectionTitle>
                {t.obligations.length === 0 ? (
                  <p className="text-xs text-warning">No obligation mapped to this test procedure.</p>
                ) : (
                  <ul className="space-y-1">
                    {t.obligations.map((o) => (
                      <li key={o.id}>
                        <Link href={`/citations?citation=${o.sourceSectionId}`} className="flex gap-2 text-xs hover:text-accent">
                          <span className="shrink-0 font-mono text-accent">{o.sourceSectionId}</span>
                          <span className="text-fg-2">{o.sectionName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardBody>
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
