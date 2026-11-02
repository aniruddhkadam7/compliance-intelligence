"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Check, GitCompareArrows, Loader2, ShieldCheck, Upload, UserCheck, X } from "lucide-react";
import { EmptyState, ErrorState, Mono, Page, PageHeader } from "@/components/common";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RelationshipTable, STATUS_TONE, type RelCitation } from "@/components/relationship-table";
import { apiGet, apiSend, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { useMe } from "@/lib/client/use-me";
import { TERMS } from "@/lib/terms";
import { TRANSITION_STATUSES } from "@/lib/ingest/relationship-statuses";

interface Pair { from: string; to: string; count: number; fromShort: string; toShort: string }
interface Impact {
  hasClientData: boolean;
  controls: { id: string; controlName: string; title: string | null; changes: { relationshipId: string; status: string; from: RelCitation | null; to: RelCitation | null }[] }[];
  pending: { id: string; action: string; reason: string; control: string; citation: RelCitation | null; createdBy: string; createdAt: string }[];
}

export function VersionImpact() {
  const [s, set] = useUrlState({ pair: "" });
  const pairs = useQuery({ queryKey: ["rel-pairs", "VERSION_TRANSITION"], queryFn: () => apiGet<Pair[]>("/api/mappings?view=pairs&kind=VERSION_TRANSITION") });
  const list = pairs.data ?? [];
  const pair = list.find((p) => `${p.from}|${p.to}` === s.pair) ?? list[0];

  return (
    <Page>
      <PageHeader
        title={TERMS.versionImpact}
        description="How a legacy document version transitions to its latest version, section by section, and which client controls are affected. Transitions come only from supplied mapping files; mapping updates apply only after human approval."
      />
      {pairs.isLoading && <Skeleton className="h-[320px]" />}
      {!!pairs.error && <Card><ErrorState error={pairs.error} onRetry={pairs.refetch} /></Card>}
      {pairs.data && !pair && (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="No legacy-to-latest mapping imported yet"
            description="Import a source relationship file (Legacy Source ID → Latest Source ID with a status such as Unchanged, Modified, Split, Combined, Added or Removed). This view then shows the transition, and the client controls affected by it."
            action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>}
          />
        </Card>
      )}
      {pair && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-xs text-muted">Transition</span>
            <Select
              value={`${pair.from}|${pair.to}`}
              onChange={(v) => set({ pair: v })}
              options={list.map((p) => ({ value: `${p.from}|${p.to}`, label: `${p.fromShort} → ${p.toShort}`, hint: `${p.count} rows` }))}
              triggerClassName="min-w-[260px]"
              aria-label="Legacy to latest transition"
            />
            <span className="flex items-center gap-2 text-[13px] font-medium"><Badge tone="outline">Legacy</Badge>{pair.fromShort}<ArrowRight className="size-3.5 text-subtle" /><Badge tone="accent">Latest</Badge>{pair.toShort}</span>
          </Card>
          <RelationshipTable kind="VERSION_TRANSITION" from={pair.from} to={pair.to} statuses={[...TRANSITION_STATUSES]} />
          <ClientImpact from={pair.from} to={pair.to} />
        </div>
      )}
    </Page>
  );
}

function ClientImpact({ from, to }: { from: string; to: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const canWrite = !!me.data?.canWrite;
  const [busy, setBusy] = useState<string | null>(null);
  const impact = useQuery({ queryKey: ["impact", from, to], queryFn: () => apiGet<Impact>(`/api/mappings${qs({ view: "impact", from, to })}`) });
  const d = impact.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["impact"] }); qc.invalidateQueries({ queryKey: ["controls"] }); };

  async function propose() {
    setBusy("propose");
    try {
      const r = await apiSend<{ created: number }>("/api/proposals", { from, to });
      toast.success(r.created ? `${r.created} mapping update${r.created > 1 ? "s" : ""} proposed for review` : "No new updates to propose");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    setBusy(id);
    try {
      await apiSend(`/api/proposals/${id}`, { decision }, "PATCH");
      toast.success(decision === "APPROVED" ? "Approved and applied to the client mapping" : "Rejected; mapping unchanged");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  if (impact.isLoading) return <Skeleton className="h-40" />;
  if (!d) return null;
  if (!d.hasClientData)
    return (
      <Card>
        <EmptyState icon={ShieldCheck} title="No client controls uploaded" description={`Framework-level changes only. Upload client controls under ${TERMS.data} to see which controls this transition affects.`} />
      </Card>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Affected client controls"
          description="Controls mapped to legacy sections that change in this transition"
          actions={<Button size="sm" variant="primary" disabled={!canWrite || !d.controls.length || busy === "propose"} onClick={propose}>{busy === "propose" ? <Loader2 className="animate-spin" /> : <UserCheck />} Propose mapping updates</Button>}
        />
        {!d.controls.length ? <EmptyState title="No client controls are affected" /> : (
          <ul className="divide-y divide-border">
            {d.controls.map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                <Link href={`/controls/${encodeURIComponent(c.controlName)}`} className="font-mono text-[13px] font-medium text-fg hover:text-accent">{c.controlName}</Link>
                <span className="ml-2 text-xs text-muted">{c.title}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.changes.map((ch) => (
                    <Badge key={ch.relationshipId} tone={STATUS_TONE[ch.status] ?? "neutral"} className="font-mono">
                      {ch.from?.sourceSectionId} {ch.to ? `→ ${ch.to.sourceSectionId}` : "retired"}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Pending human review" description="Proposed changes to the approved client mapping. Nothing changes until approved." />
        {!d.pending.length ? <EmptyState title="No pending proposals" /> : (
          <ul className="divide-y divide-border">
            {d.pending.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-4 py-2.5">
                <Badge tone={p.action === "ADD" ? "success" : "danger"} className="mt-0.5">{p.action === "ADD" ? "Map" : "Unmap"}</Badge>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="text-[13px] text-fg"><Mono>{p.control}</Mono> {p.action === "ADD" ? "→" : "×"} <Mono>{p.citation?.sourceSectionId}</Mono></div>
                  <div className="text-muted">{p.reason}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon-sm" variant="primary" aria-label="Approve" disabled={!canWrite || busy === p.id} onClick={() => review(p.id, "APPROVED")}><Check /></Button>
                  <Button size="icon-sm" aria-label="Reject" disabled={!canWrite || busy === p.id} onClick={() => review(p.id, "REJECTED")}><X /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

