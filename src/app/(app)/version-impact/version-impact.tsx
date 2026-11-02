"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, GitCompareArrows, ShieldAlert } from "lucide-react";
import { EmptyState, ErrorState, Page, PageHeader, StatStrip } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiSend } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import type { Comparison, Families } from "./types";
import { ControlReferenceDiff } from "./control-refs";
import { ImpactList } from "./impact";

export function VersionImpact() {
  const [s, set] = useUrlState({ from: "", to: "", tab: "refs", only: "" });
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

  const c = cmp.data;
  // Control-level impact only: controls whose stated references differ between versions.
  const impacted = useMemo(
    () => (c ? c.controlRefs.filter((r) => r.added.length || r.removed.length) : []),
    [c],
  );
  const governGain = impacted.filter((r) => r.added.some((t) => /^GV./i.test(t))).length;

  return (
    <Page>
      <PageHeader
        title="Version Impact Analysis"
        description="How a framework's evolution affects existing CCF controls: which control references change between the legacy and latest version. An update never changes a CCF mapping automatically."
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
            className="mb-4 xl:grid-cols-4"
            items={[
              { label: "Controls with references", value: c.summary.controlsWithRefs, sub: c.referenceColumns ? `State both ${c.from.short} and ${c.to.short} references` : "No version-specific columns" },
              { label: "References changed", value: c.summary.refsChanged, tone: "warning", sub: "Controls to review" },
              { label: "References unchanged", value: c.summary.refsUnchanged, tone: "success", sub: "No action needed" },
              { label: "Gain Govern (GV) references", value: governGain, tone: "accent", sub: "Scope expands into Govern" },
            ]}
          />
          <Tabs value={s.tab} onValueChange={(v) => set({ tab: v })}>
            <TabsList className="mb-4">
              <TabsTrigger value="refs"><ClipboardList /> Control reference changes</TabsTrigger>
              <TabsTrigger value="impact"><ShieldAlert /> Impact assessment</TabsTrigger>
            </TabsList>
            <TabsContent value="refs"><ControlReferenceDiff c={c} only={s.only} setOnly={(v) => set({ only: v })} /></TabsContent>
            <TabsContent value="impact"><ImpactList c={c} impacted={impacted} /></TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
}
