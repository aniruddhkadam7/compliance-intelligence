"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, Download, FileSpreadsheet, GitCompareArrows, ListTree, ShieldAlert, Upload, Workflow } from "lucide-react";
import { EmptyState, ErrorState, Page, PageHeader, StatStrip } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiSend } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import type { Comparison, Families } from "./types";
import { TransitionExamples } from "./transitions";
import { ControlReferenceDiff } from "./control-refs";
import { RequirementShift } from "./requirement-shift";
import { FunctionFlow, ImpactList } from "./impact";

export function VersionImpact() {
  const [s, set] = useUrlState({ from: "", to: "", tab: "examples", only: "" });
  const meta = useQuery({ queryKey: ["version-meta"], queryFn: () => apiGet<Families>("/api/version") });

  // Default: NIST CSF oldest → newest when available.
  const csf = meta.data?.families.find((f) => f.family === "NIST CSF") ?? meta.data?.families[0];
  const fromId = s.from || csf?.versions[0]?.id || "";
  const toId = s.to || csf?.versions[csf.versions.length - 1]?.id || "";
  const family = meta.data?.families.find((f) => f.versions.some((v) => v.id === fromId));

  const cmp = useQuery({
    queryKey: ["compare", fromId, toId],
    queryFn: () => apiSend<Comparison>("/api/version/compare", { fromId, toId }),
    enabled: !!fromId && !!toId && fromId !== toId,
  });

  const transitions = useMemo(() => meta.data?.transitions ?? [], [meta.data]);
  const c = cmp.data;

  return (
    <Page>
      <PageHeader
        title="Version Impact Analysis"
        description="How a framework's evolution affects existing CCF requirements, test procedures and evidence. Comparisons use workbook data only. An update never changes a CCF mapping automatically."
        actions={
          <>
            <Button asChild size="sm"><a href="/api/version/template"><Download /> Transition template</a></Button>
            <Button asChild size="sm" variant="primary"><Link href="/data?tab=import"><Upload /> Import transition workbook</Link></Button>
          </>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <Select
          value={family?.family ?? ""}
          onChange={(v) => { const f = meta.data?.families.find((x) => x.family === v); if (f) set({ from: f.versions[0].id, to: f.versions[f.versions.length - 1].id }); }}
          options={(meta.data?.families ?? []).map((f) => ({ value: f.family, label: f.family, hint: `${f.versions.length} versions` }))}
          placeholder="Framework family" triggerClassName="min-w-[180px]" aria-label="Framework family"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Old version</span>
          <Select value={fromId} onChange={(v) => set({ from: v })} options={(family?.versions ?? []).map((v) => ({ value: v.id, label: v.short, hint: `${v.citations} citations` }))} aria-label="Old version" />
          <ArrowRight className="size-4 text-subtle" />
          <span className="text-xs text-muted">New version</span>
          <Select value={toId} onChange={(v) => set({ to: v })} options={(family?.versions ?? []).map((v) => ({ value: v.id, label: v.short, hint: `${v.citations} citations` }))} aria-label="New version" />
        </div>
        {fromId === toId && fromId && <span className="text-xs text-warning">Choose two different versions.</span>}
      </Card>

      {(meta.isLoading || cmp.isLoading) && <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-[420px]" /></div>}
      {!!(meta.error || cmp.error) && <Card><ErrorState error={meta.error || cmp.error} onRetry={() => { meta.refetch(); cmp.refetch(); }} /></Card>}
      {!meta.isLoading && !meta.data?.families.length && <Card><EmptyState icon={GitCompareArrows} title="No framework with multiple versions" description="Import a workbook that contains two versions of the same framework family." /></Card>}

      {c && (
        <>
          <StatStrip
            className="mb-4 xl:grid-cols-6"
            items={[
              { label: "IRs cited by both", value: c.summary.both, sub: `${c.from.short} and ${c.to.short}` },
              { label: "Function / domain shifts", value: c.summary.functionChanged, tone: "accent", sub: "IRs whose citations move function" },
              { label: `Only in ${c.from.short}`, value: c.summary.onlyOld, tone: c.summary.onlyOld ? "warning" : "default", sub: "No longer cited" },
              { label: `Only in ${c.to.short}`, value: c.summary.onlyNew, sub: "Newly cited IRs" },
              { label: "Control references changed", value: c.referenceColumns ? `${c.summary.refsChanged} / ${c.summary.controlsWithRefs}` : "—", sub: c.referenceColumns ? "Direct CCF crosswalk columns" : "No version-specific columns" },
              { label: "Controls to review", value: c.summary.impactedControls, tone: "warning", sub: "Indicative, needs SME review" },
            ]}
          />
          <Tabs value={s.tab} onValueChange={(v) => set({ tab: v })}>
            <TabsList className="mb-4">
              <TabsTrigger value="examples"><FileSpreadsheet /> Transition examples {transitions.length > 0 && `(${transitions.length})`}</TabsTrigger>
              <TabsTrigger value="refs"><ClipboardList /> Control reference changes</TabsTrigger>
              <TabsTrigger value="requirements"><ListTree /> Requirement citation changes</TabsTrigger>
              <TabsTrigger value="flow"><Workflow /> Function / domain flow</TabsTrigger>
              <TabsTrigger value="impact"><ShieldAlert /> Impact assessment</TabsTrigger>
            </TabsList>
            <TabsContent value="examples"><TransitionExamples transitions={transitions} /></TabsContent>
            <TabsContent value="refs"><ControlReferenceDiff c={c} only={s.only} setOnly={(v) => set({ only: v })} /></TabsContent>
            <TabsContent value="requirements"><RequirementShift c={c} /></TabsContent>
            <TabsContent value="flow"><FunctionFlow c={c} /></TabsContent>
            <TabsContent value="impact"><ImpactList c={c} /></TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
}
