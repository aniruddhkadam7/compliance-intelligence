"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, RadioTower, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, KeyValue, Mono, SectionTitle, TableSkeleton } from "@/components/common";
import { apiGet, apiSend, qs } from "@/lib/client/api";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { ConnectorRow } from "./connector-table";

interface Update {
  id: string; connectorId: string; changeType: string; title: string; summary: string; details: Record<string, unknown> | null;
  previousValue: string | null; newValue: string | null; reviewStatus: string; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null;
  detectedAt: string; connector: { id: string; name: string; sourceName: string; officialUrl: string };
}

export const CHANGE_TYPES: Record<string, { label: string; tone: "warning" | "info" | "accent" | "neutral" }> = {
  VERSION_CHANGE: { label: "Version change", tone: "warning" },
  CONTENT_CHANGE: { label: "Content change", tone: "info" },
  NEW_PUBLICATION: { label: "New publication", tone: "accent" },
  NEW_INFORMATIVE_REFERENCE: { label: "New informative reference", tone: "neutral" },
};
const STATUS_TONE = { NEW: "warning", ACKNOWLEDGED: "success", DISMISSED: "neutral" } as const;

export function UpdatesList({
  canWrite, connectors, status, connector, type, selected, set,
}: {
  canWrite: boolean; connectors: ConnectorRow[]; status: string; connector: string; type: string; selected: string;
  set: (p: Record<string, string>) => void;
}) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, connector, type]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["updates", status, connector, type, page],
    queryFn: () => apiGet<{ items: Update[]; total: number }>(`/api/updates${qs({ status: status === "all" ? "" : status, connectorId: connector, changeType: type, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  const current = data?.items.find((u) => u.id === selected);
  const detail = useQuery({
    queryKey: ["update", selected],
    queryFn: () => apiGet<{ items: Update[] }>(`/api/updates${qs({ pageSize: 100 })}`).then((r) => r.items.find((u) => u.id === selected) ?? null),
    enabled: !!selected && !current,
  });
  const open = current ?? detail.data ?? null;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <h3 className="mr-2 flex items-center gap-2 text-[13px] font-semibold"><RadioTower className="size-4 text-muted" /> Update centre</h3>
        <div className="flex rounded-md border border-border p-0.5">
          {[["NEW", "To review"], ["ACKNOWLEDGED", "Acknowledged"], ["DISMISSED", "Dismissed"], ["", "All"]].map(([v, l]) => (
            <button key={v} onClick={() => set({ status: v || "all" })} className={cn("rounded-[4px] px-2.5 py-1 text-xs font-medium", (status === v || (!v && status === "all")) ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>{l}</button>
          ))}
        </div>
        <Select value={connector} onChange={(v) => set({ connector: v })} allLabel="All connectors" options={connectors.map((c) => ({ value: c.id, label: c.name }))} triggerClassName="min-w-[200px]" aria-label="Connector" />
        <Select value={type} onChange={(v) => set({ type: v })} allLabel="All change types" options={Object.entries(CHANGE_TYPES).map(([v, t]) => ({ value: v, label: t.label }))} aria-label="Change type" />
      </div>
      {isLoading && <TableSkeleton rows={4} cols={4} />}
      {!!error && <ErrorState error={error} onRetry={refetch} />}
      {data && !data.items.length && <EmptyState icon={RadioTower} title={status === "NEW" ? "No updates waiting for review" : "No updates"} description="Run “Check now” on a connector to detect changes at the official source." />}
      <ul className="divide-y divide-border">
        {data?.items.map((u) => (
          <li key={u.id}>
            <button onClick={() => set({ update: u.id })} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2", selected === u.id && "bg-accent-soft/50")}>
              <Badge tone={CHANGE_TYPES[u.changeType]?.tone ?? "neutral"} className="mt-0.5 w-[120px] justify-center">{CHANGE_TYPES[u.changeType]?.label ?? u.changeType}</Badge>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-fg">{u.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted">{u.summary}</div>
                <div className="mt-1 text-[11px] text-subtle">{u.connector.name} · detected {formatRelative(u.detectedAt)}</div>
              </div>
              <Badge tone={STATUS_TONE[u.reviewStatus as keyof typeof STATUS_TONE] ?? "neutral"}>{u.reviewStatus.toLowerCase()}</Badge>
            </button>
          </li>
        ))}
      </ul>
      {data && data.total > 20 && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2 text-xs text-muted">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      <UpdateSheet update={open} canWrite={canWrite} onClose={() => set({ update: "" })} />
    </Card>
  );
}

function UpdateSheet({ update: u, canWrite, onClose }: { update: Update | null; canWrite: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(u?.reviewNote ?? ""), [u?.id, u?.reviewNote]);
  const items = (u?.details?.items as { celex: string; date: string | null; kind: string; url: string }[] | undefined) ?? null;

  async function review(reviewStatus: "ACKNOWLEDGED" | "DISMISSED" | "NEW") {
    if (!u) return;
    setBusy(true);
    try {
      await apiSend(`/api/updates/${u.id}`, { reviewStatus, reviewNote: note || undefined }, "PATCH");
      toast.success(reviewStatus === "NEW" ? "Update reopened" : `Update ${reviewStatus.toLowerCase()}`, { description: "No CCF mapping was changed." });
      qc.invalidateQueries({ queryKey: ["updates"] });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!u} onOpenChange={(o) => !o && onClose()} title={u?.title ?? "Update"} description={u ? `${u.connector.name} · ${formatDateTime(u.detectedAt)}` : undefined}>
      {u && (
        <div className="divide-y divide-border">
          <section className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone={CHANGE_TYPES[u.changeType]?.tone ?? "neutral"}>{CHANGE_TYPES[u.changeType]?.label ?? u.changeType}</Badge>
              <Badge tone={STATUS_TONE[u.reviewStatus as keyof typeof STATUS_TONE] ?? "neutral"}>{u.reviewStatus.toLowerCase()}</Badge>
            </div>
            <p className="text-[13px] leading-relaxed text-fg-2">{u.summary}</p>
            <KeyValue
              items={[
                { label: "Previous value", value: u.previousValue ? <Mono>{u.previousValue}</Mono> : null },
                { label: "New value", value: u.newValue ? <Mono>{u.newValue}</Mono> : null },
                { label: "Source", value: <a href={u.connector.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">{u.connector.sourceName} <ExternalLink className="size-3" /></a> },
                { label: "Reviewed", value: u.reviewedBy ? `${u.reviewedBy} · ${formatDateTime(u.reviewedAt)}` : null },
              ]}
            />
          </section>
          {items && (
            <section className="p-5">
              <SectionTitle>Related publications in CELLAR</SectionTitle>
              <ul className="divide-y divide-border rounded-md border border-border">
                {items.map((i) => (
                  <li key={i.celex} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="font-mono text-accent hover:underline">{i.celex}</a>
                    <span className="flex items-center gap-2"><Badge tone="outline">{i.kind}</Badge><span className="text-muted tabular">{i.date ?? "—"}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {u.details && !items && Object.keys(u.details).length > 0 && (
            <section className="p-5">
              <SectionTitle>Change details</SectionTitle>
              <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] text-fg-2">{JSON.stringify(u.details, null, 2)}</pre>
            </section>
          )}
          <section className="space-y-3 p-5">
            <div className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
              Reviewing records your decision and an audit entry. Approved CCF mappings change only through a reviewed workbook import.
            </div>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (e.g. impact assessed, mapping review scheduled)…" disabled={!canWrite} />
            <div className="flex flex-wrap gap-2">
              {u.reviewStatus !== "ACKNOWLEDGED" && <Button variant="primary" size="sm" disabled={!canWrite || busy} onClick={() => review("ACKNOWLEDGED")}><Check /> Acknowledge</Button>}
              {u.reviewStatus !== "DISMISSED" && <Button size="sm" disabled={!canWrite || busy} onClick={() => review("DISMISSED")}><X /> Dismiss</Button>}
              {u.reviewStatus !== "NEW" && <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => review("NEW")}><RotateCcw /> Reopen</Button>}
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
