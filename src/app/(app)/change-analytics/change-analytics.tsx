"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BellRing, Check, GitCompareArrows, Grid3x3, ListChecks, Loader2, X } from "lucide-react";
import { EmptyState, ErrorState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { TERMS } from "@/lib/terms";
import { cn, formatDateTime } from "@/lib/utils";

type Kind = "UNCHANGED" | "MODIFIED" | "RENUMBERED" | "SPLIT" | "COMBINED" | "ADDED" | "REMOVED";
interface Ref { id: string; short: string; version: string | null; removed?: boolean }
interface Update { id: string; family: string | null; previous: Ref | null; current: Ref | null; approvedBy: string | null; approvedAt: string; counts: Record<Kind, number> | null; pendingProposals: number }
interface Detail extends Update {
  summary: string | null;
  relations: { kind: Kind; from: string[]; to: string[]; confidence: number; explanation: string; before: { id: string; text: string | null }[]; after: { id: string; title: string; text: string }[] }[];
  matrix: Record<string, Record<Kind, number>>;
  proposals: { id: string; action: string; status: string; reason: string; changeType: string | null; confidence: number | null; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null; control: { id: string; controlName: string; title: string | null }; section: string }[];
  affectedControls: { id: string; controlName: string; title: string | null }[];
  unaffectedControls: { id: string; controlName: string; title: string | null }[];
  newlyUnmapped: string[];
  totalControls: number;
  controlImpacts: ControlImpact[];
}
interface ControlImpact {
  control: { id: string; controlName: string; title: string | null };
  previous: { section: string; name: string }[];
  updated: { id: string; section: string; name: string; status: string }[];
  retired: { id: string; section: string; status: string }[];
  relationships: { kind: Kind; from: string[]; to: string[]; confidence: number; explanation: string }[];
  pending: number;
}

export const KIND: Record<Kind, { label: string; tone: Tone; color: string }> = {
  UNCHANGED: { label: "Unchanged", tone: "success", color: "#1baf7a" },
  ADDED: { label: "Added", tone: "info", color: "#2a78d6" },
  MODIFIED: { label: "Modified", tone: "warning", color: "#eda100" },
  RENUMBERED: { label: "Renumbered", tone: "warning", color: "#c98500" },
  SPLIT: { label: "Split", tone: "warning", color: "#eb6834" },
  COMBINED: { label: "Combined", tone: "warning", color: "#d95926" },
  REMOVED: { label: "Removed", tone: "danger", color: "#d1293d" },
};
const KINDS = Object.keys(KIND) as Kind[];
const PROPOSAL_STATUS: Record<string, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "neutral" };
/** "EU AI Act 2024": short names of laws carry no version, so it is added wherever a version is named. */
const vname = (r: Ref | null | undefined) => (!r ? "—" : r.version && !r.short.includes(r.version) ? `${r.short} ${r.version}` : r.short);

export function ChangeAnalytics() {
  const [s, set] = useUrlState({ update: "", tab: "controls", kind: "", control: "" });
  const list = useQuery({ queryKey: ["change-analytics"], queryFn: () => apiGet<Update[]>("/api/change-analytics") });
  const selected = s.update || list.data?.[0]?.id || "";
  const detail = useQuery({ queryKey: ["change-analytics", selected], queryFn: () => apiGet<Detail>(`/api/change-analytics/${selected}`), enabled: !!selected });

  return (
    <Page>
      <PageHeader title={TERMS.versionImpact} description="What changed between an approved framework version and the one before it, and which client controls are affected. Mapping changes take effect only when approved." />
      {list.isLoading && <Skeleton className="h-60" />}
      {!!list.error && <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>}
      {list.data && !list.data.length && (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="No framework updates installed yet"
            description="When a newer version of a framework is available, an admin uploads the official document and releases it; the document in Sources then shows an Update button. Once it is installed, what changed and which client controls are affected appear here."
            action={<Button asChild variant="primary"><Link href="/sources">Go to {TERMS.sources}</Link></Button>}
          />
        </Card>
      )}
      {list.data && list.data.length > 0 && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-xs text-muted">Version update</span>
            <Select value={selected} onChange={(v) => set({ update: v })} options={list.data.map((u) => ({ value: u.id, label: `${vname(u.previous)} → ${vname(u.current)}`, hint: u.pendingProposals ? `${u.pendingProposals} to review` : undefined }))} triggerClassName="min-w-[320px]" aria-label="Version update" />
          </Card>
          {detail.isLoading && <Skeleton className="h-80" />}
          {!!detail.error && <Card><ErrorState error={detail.error} onRetry={detail.refetch} /></Card>}
          {detail.data && <UpdateView d={detail.data} tab={s.tab} kind={s.kind} control={s.control} set={set} />}
        </div>
      )}
    </Page>
  );
}

function UpdateView({ d, tab, kind, control, set }: { d: Detail; tab: string; kind: string; control: string; set: (p: Record<string, string>) => void }) {
  const c = d.counts ?? ({} as Record<Kind, number>);
  const pending = d.proposals.filter((p) => p.status === "PENDING");
  const affectedPending = new Set(pending.map((p) => p.control.id)).size;
  return (
    <>
      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-10 gap-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{d.family ?? d.current?.short} version transition</div>
            <div className="mt-1 flex items-center gap-3">
              <div><div className="text-[11px] text-muted">Previous version</div><div className="text-2xl font-semibold tabular text-fg">{d.previous?.version ?? "—"}</div></div>
              <ArrowRight className="size-5 text-subtle" />
              <div><div className="text-[11px] text-muted">Updated version</div><div className="text-2xl font-semibold tabular text-fg">{d.current?.version ?? "—"}</div></div>
            </div>
            <div className="mt-1 text-[11px] text-muted">Approved {formatDateTime(d.approvedAt)}{d.approvedBy ? ` by ${d.approvedBy}` : ""}</div>
            {d.previous?.removed && <div className="mt-1 max-w-md text-[11px] text-warning">{d.previous.short} has since been removed from the library. The comparison is kept; previous wording is shown where it was recorded, and its client mappings no longer exist.</div>}
          </div>
          <div><div className="text-2xl font-semibold tabular text-warning">{d.affectedControls.length}</div><div className="text-[11px] text-muted">Affected client controls</div></div>
          <div><div className="text-2xl font-semibold tabular text-fg">{d.totalControls}</div><div className="text-[11px] text-muted">Total client controls</div></div>
        </CardBody>
      </Card>
      {affectedPending > 0 && (
        <Card className="border-warning/50 bg-warning-soft/30">
          <CardBody className="flex flex-wrap items-center gap-3 text-[13px]">
            <BellRing className="size-4 text-warning" />
            <span className="flex-1">
              <b>Significant framework mapping changes have been identified.</b> Updated mappings have been generated. Please review and approve the proposed remapping.
            </span>
            <Button size="sm" variant="primary" onClick={() => set({ tab: "proposals" })}>Review {pending.length} proposed change{pending.length === 1 ? "" : "s"}</Button>
          </CardBody>
        </Card>
      )}
      {d.affectedControls.length > 0 && affectedPending === 0 && <Card><CardBody className="flex items-center gap-2 text-[13px]"><Check className="size-4 text-success" /> All proposed remapping for this version has been reviewed.</CardBody></Card>}
      <StatStrip
        className="xl:grid-cols-6"
        items={[
          { label: "Added", value: c.ADDED ?? 0 },
          { label: "Modified", value: c.MODIFIED ?? 0 },
          { label: "Removed", value: c.REMOVED ?? 0, tone: c.REMOVED ? "warning" : "default" },
          { label: "Renumbered / split / combined", value: (c.RENUMBERED ?? 0) + (c.SPLIT ?? 0) + (c.COMBINED ?? 0) },
          { label: "Proposals pending review", value: pending.length, tone: pending.length ? "warning" : "default" },
          { label: "New, not yet mapped", value: d.newlyUnmapped.length, hint: "Requirements added in the new version that no client control maps to" },
        ]}
      />
      {d.summary && (
        <Card><CardBody className="text-[13px]"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">AI-generated summary · reviewed before approval</div><p className="whitespace-pre-line text-fg-2">{d.summary}</p></CardBody></Card>
      )}
      <div className="flex flex-wrap gap-1">
        {([["controls", `Affected controls (${d.affectedControls.length})`], ["proposals", `Proposed mapping changes (${d.proposals.length})`], ["changes", `Requirement changes (${d.relations.length})`], ["analytics", "Analytics"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => set({ tab: id })} className={cn("rounded-md border px-3 py-1.5 text-xs", tab === id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>{label}</button>
        ))}
      </div>
      {tab === "controls" && <AffectedControls d={d} selected={control} set={set} />}
      {tab === "proposals" && <Proposals d={d} />}
      {tab === "changes" && <Changes d={d} kind={kind} set={set} />}
      {tab === "analytics" && <Analytics d={d} />}
    </>
  );
}

function Proposals({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = d.proposals.filter((p) => p.status === "PENDING");
  const decide = async (ids: string[], decision: "APPROVED" | "REJECTED") => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await apiSend<{ applied: number }>("/api/change-analytics/decisions", { ids, decision, note: note || undefined });
      toast.success(`${r.applied} suggestion(s) ${decision === "APPROVED" ? "approved" : "rejected"}`);
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ["change-analytics"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Decision failed"); }
    finally { setBusy(false); }
  };
  if (!d.proposals.length)
    return <Card><EmptyState icon={ListChecks} title="No mapping changes suggested" description={d.totalControls ? "No client control is mapped to a requirement that changed." : "No client controls are mapped to the previous version, so no client impact can be derived."} /></Card>;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" className="max-w-xs" aria-label="Review note" />
        <Button size="sm" variant="primary" disabled={busy || !sel.size} onClick={() => decide([...sel], "APPROVED")}>{busy ? <Loader2 className="animate-spin" /> : <Check />} Approve selected ({sel.size})</Button>
        <Button size="sm" disabled={busy || !sel.size} onClick={() => decide([...sel], "REJECTED")}><X /> Reject selected</Button>
        <Button size="sm" variant="ghost" disabled={busy || !pending.length} onClick={() => decide(pending.map((p) => p.id), "APPROVED")}>Approve all pending ({pending.length})</Button>
        <span className="ml-auto text-xs text-muted">Approved mappings take effect immediately; the previous version&apos;s mappings are kept.</span>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface-2"><tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted"><th className="w-10 px-3 py-2" /><th className="px-3 py-2">Client control</th><th className="px-3 py-2">Suggestion</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody>
            {d.proposals.map((p) => (
              <tr key={p.id} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2">{p.status === "PENDING" && <input type="checkbox" checked={sel.has(p.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} aria-label={`Select suggestion for ${p.control.controlName}`} className="size-4" />}</td>
                <td className="px-3 py-2"><Link href={`/change-analytics?update=${d.id}&tab=controls&control=${encodeURIComponent(p.control.controlName)}`} className="font-mono font-medium text-fg hover:text-accent">{p.control.controlName}</Link><div className="line-clamp-1 text-muted">{p.control.title}</div></td>
                <td className="whitespace-nowrap px-3 py-2">{p.action === "ADD" ? <>Map to <Mono className="text-xs">{p.section}</Mono></> : <span className="text-danger">Requirement <Mono className="text-xs">{p.section}</Mono> removed</span>}</td>
                <td className="px-3 py-2">{p.changeType && <Badge tone={KIND[p.changeType as Kind]?.tone ?? "neutral"}>{KIND[p.changeType as Kind]?.label ?? p.changeType}</Badge>}</td>
                <td className="px-3 py-2 tabular text-fg-2">{p.confidence != null ? `${Math.round(p.confidence * 100)}%` : "—"}</td>
                <td className="max-w-[420px] px-3 py-2 text-muted">{p.reason}</td>
                <td className="whitespace-nowrap px-3 py-2"><Badge tone={PROPOSAL_STATUS[p.status] ?? "neutral"}>{p.status.toLowerCase()}</Badge>{p.reviewedBy && <div className="text-[11px] text-muted">{p.reviewedBy}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(d.affectedControls.length > 0 || d.newlyUnmapped.length > 0) && (
        <div className="grid gap-4 border-t border-border p-4 text-xs md:grid-cols-2">
          <div><div className="mb-1 font-semibold text-fg">Affected controls ({d.affectedControls.length})</div>{d.affectedControls.map((c) => <div key={c.id} className="font-mono text-fg-2">{c.controlName}</div>)}</div>
          <div><div className="mb-1 font-semibold text-fg">New requirements not yet mapped ({d.newlyUnmapped.length})</div><div className="flex flex-wrap gap-1">{d.newlyUnmapped.slice(0, 60).map((id) => <Badge key={id} tone="outline" className="font-mono">{id}</Badge>)}{d.newlyUnmapped.length > 60 && <span className="text-muted">+{d.newlyUnmapped.length - 60}</span>}</div></div>
        </div>
      )}
    </Card>
  );
}

function Changes({ d, kind, set }: { d: Detail; kind: string; set: (p: Record<string, string>) => void }) {
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => d.relations.filter((r) => !kind || r.kind === kind), [d.relations, kind]);
  return (
    <Card>
      <div className="flex flex-wrap gap-1 border-b border-border p-3">
        <button onClick={() => set({ kind: "" })} className={cn("rounded-md border px-2 py-1 text-xs", !kind ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}>All {d.relations.length}</button>
        {KINDS.filter((k) => k !== "UNCHANGED" && d.relations.some((r) => r.kind === k)).map((k) => (
          <button key={k} onClick={() => set({ kind: k })} className={cn("rounded-md border px-2 py-1 text-xs", kind === k ? "border-accent bg-accent-soft text-accent" : "border-border text-muted")}>{KIND[k].label} {d.relations.filter((r) => r.kind === k).length}</button>
        ))}
      </div>
      <ul className="max-h-[640px] divide-y divide-border overflow-auto">
        {rows.slice(0, limit).map((r, i) => (
          <li key={i} className="px-4 py-3 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone={KIND[r.kind].tone}>{KIND[r.kind].label}</Badge>
              <Mono className="font-medium text-fg">{r.from.join(", ") || "—"}</Mono><ArrowRight className="size-3 text-subtle" /><Mono className="font-medium text-fg">{r.to.join(", ") || "—"}</Mono>
              <span className="text-muted">confidence {Math.round(r.confidence * 100)}%</span>
            </div>
            <p className="mb-1.5 text-muted">{r.explanation}</p>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded border border-border bg-surface-2 p-2"><div className="mb-0.5 text-[10px] font-semibold uppercase text-subtle">Previous ({vname(d.previous)})</div>{r.before.length ? r.before.map((b) => <p key={b.id} className="line-clamp-5 whitespace-pre-line text-fg-2"><b>{b.id}</b> {b.text ?? <span className="text-subtle">Previous wording not recorded</span>}</p>) : <p className="text-subtle">Not in the previous version</p>}</div>
              <div className="rounded border border-border bg-surface-2 p-2"><div className="mb-0.5 text-[10px] font-semibold uppercase text-subtle">New ({vname(d.current)})</div>{r.after.length ? r.after.map((a) => <p key={a.id} className="line-clamp-5 whitespace-pre-line text-fg-2"><b>{a.id}</b> {a.title ? `${a.title}. ` : ""}{a.text}</p>) : <p className="text-subtle">Not in the new version</p>}</div>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > limit && <div className="border-t border-border p-2 text-center"><Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 80)}>Show more ({rows.length - limit} remaining)</Button></div>}
    </Card>
  );
}

/** Red-and-green comparison matrix: domains by change type, plus the client impact split. */
function Analytics({ d }: { d: Detail }) {
  // Document order (first appearance), so chapters read I, II, III … rather than alphabetically.
  const domains = Object.keys(d.matrix);
  const max = Math.max(1, ...domains.flatMap((x) => KINDS.map((k) => d.matrix[x][k])));
  const total = d.affectedControls.length + d.unaffectedControls.length;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="Change matrix" description="Sections per domain and type of change (green: unchanged or added, amber: changed, red: removed)" icon={<Grid3x3 />} />
        <div className="overflow-auto p-4">
          <table className="border-separate border-spacing-1 text-xs">
            <thead><tr><th />{KINDS.map((k) => <th key={k} className="px-1 pb-1 text-left font-medium text-muted">{KIND[k].label}</th>)}</tr></thead>
            <tbody>
              {domains.map((dom) => (
                <tr key={dom}>
                  <th className="max-w-[260px] pr-2 text-left text-[11px] font-medium leading-tight text-fg-2">{dom}</th>
                  {KINDS.map((k) => {
                    const n = d.matrix[dom][k];
                    return (
                      <td key={k} className="p-0">
                        <div className="grid h-8 min-w-[64px] place-items-center rounded tabular" style={n ? { background: `color-mix(in oklab, ${KIND[k].color} ${20 + (n / max) * 70}%, var(--surface))`, color: n / max > 0.5 ? "#fff" : "var(--fg)", fontWeight: 600 } : { border: "1px dashed var(--border)" }}>{n || ""}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Client impact" description="Controls mapped to the previous version" />
        <CardBody className="space-y-3 text-xs">
          {total ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
                <div style={{ width: `${(d.affectedControls.length / total) * 100}%`, background: KIND.REMOVED.color }} />
                <div style={{ width: `${(d.unaffectedControls.length / total) * 100}%`, background: KIND.UNCHANGED.color }} />
              </div>
              <div className="flex justify-between"><span><span style={{ color: KIND.REMOVED.color }}>■</span> Affected {d.affectedControls.length}</span><span><span style={{ color: KIND.UNCHANGED.color }}>■</span> Unaffected {d.unaffectedControls.length}</span></div>
            </>
          ) : <p className="text-muted">No client controls are mapped to the previous version.</p>}
          <div className="border-t border-border pt-2">
            {(["APPROVED", "PENDING", "REJECTED"] as const).map((st) => <div key={st} className="flex justify-between py-0.5"><span className="text-muted">Suggestions {st.toLowerCase()}</span><span className="tabular">{d.proposals.filter((p) => p.status === st).length}</span></div>)}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}


const STATUS_NOTE: Record<string, string> = { PENDING: "proposed", APPROVED: "approved", REJECTED: "rejected" };
const sectionLabel = (section: string, name: string) => name.replace(section, "").replace(/^[\s:\-–]+/, "");

/** Only the controls whose mapping the new version affects. Selecting one compares its mapping before and after. */
function AffectedControls({ d, selected, set }: { d: Detail; selected: string; set: (p: Record<string, string>) => void }) {
  const open = d.controlImpacts.find((x) => x.control.controlName === selected) ?? null;
  if (!d.controlImpacts.length)
    return <Card><EmptyState icon={ListChecks} title="No client controls are affected" description="No client control is mapped to a requirement that changed in this version." /></Card>;
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="self-start">
        <CardHeader title={`Affected controls (${d.controlImpacts.length} of ${d.totalControls})`} description="Select a control to compare its mapping" />
        <ul className="max-h-[640px] divide-y divide-border overflow-auto">
          {d.controlImpacts.map((x) => (
            <li key={x.control.id}>
              <button onClick={() => set({ control: x.control.controlName })} className={cn("flex w-full items-start gap-2 px-4 py-2.5 text-left text-xs hover:bg-surface-2", open?.control.id === x.control.id && "bg-accent-soft")}>
                <div className="min-w-0 flex-1"><div className="font-mono font-medium text-fg">{x.control.controlName}</div><div className="line-clamp-2 text-muted">{x.control.title}</div></div>
                {x.pending > 0 ? <Badge tone="warning">To review</Badge> : <Badge tone="success">Reviewed</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {open ? <ControlComparison d={d} x={open} /> : <Card><EmptyState icon={GitCompareArrows} title="Select an affected control" description="The previous and updated framework mapping, citations and relationships are shown side by side." /></Card>}
    </div>
  );
}

function Row({ title, before, after }: { title: string; before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="border-b border-border p-4 last:border-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-surface-2 p-3 text-xs">{before}</div>
        <div className="rounded border border-accent/30 bg-accent-soft/30 p-3 text-xs">{after}</div>
      </div>
    </div>
  );
}

function ControlComparison({ d, x }: { d: Detail; x: ControlImpact }) {
  const fw = (v: string | null | undefined, short: string | undefined) => [short, v && `v${v}`].filter(Boolean).join(" ");
  const none = <span className="text-subtle">None</span>;
  return (
    <Card>
      <CardHeader title={<span className="font-mono">{x.control.controlName}</span>} description={x.control.title ?? undefined} actions={<Button asChild size="sm" variant="ghost"><Link href={`/controls/${encodeURIComponent(x.control.controlName)}`}>Open control</Link></Button>} />
      <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">Test procedures are unchanged by a framework version. Only the framework mapping and citations below change.</div>
      <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-2">
        <div className="text-[13px] font-semibold text-fg">Previous mapping</div>
        <div className="text-[13px] font-semibold text-fg">Updated mapping {x.pending > 0 && <Badge tone="warning" className="ml-1">Awaiting approval</Badge>}</div>
      </div>
      <Row title="Framework references" before={<Badge tone="outline">{fw(d.previous?.version, d.previous?.short)}</Badge>} after={<Badge tone="accent">{fw(d.current?.version, d.current?.short)}</Badge>} />
      <Row
        title="Source IDs / citations"
        before={x.previous.length ? <ul className="space-y-1">{x.previous.map((c) => <li key={c.section}><Mono className="font-medium text-fg">{c.section}</Mono> <span className="text-muted">{sectionLabel(c.section, c.name)}</span></li>)}</ul> : none}
        after={x.updated.length || x.retired.length ? (
          <ul className="space-y-1">
            {x.updated.map((c) => <li key={c.id}><Mono className="font-medium text-fg">{c.section}</Mono> <span className="text-muted">{sectionLabel(c.section, c.name)}</span> <Badge tone={PROPOSAL_STATUS[c.status] ?? "neutral"} className="ml-1">{STATUS_NOTE[c.status] ?? c.status.toLowerCase()}</Badge></li>)}
            {x.retired.map((c) => <li key={c.id} className="text-danger"><Mono>{c.section}</Mono> has no equivalent in the new version; needs a manual decision</li>)}
          </ul>
        ) : none}
      />
      <Row
        title="Relationships"
        before={<span className="text-muted">Each previous citation is mapped as-is in {vname(d.previous)}.</span>}
        after={x.relationships.length ? (
          <ul className="space-y-2">
            {x.relationships.map((r, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-center gap-1.5"><Badge tone={KIND[r.kind].tone}>{KIND[r.kind].label}</Badge><Mono>{r.from.join(", ")}</Mono><ArrowRight className="size-3 text-subtle" /><Mono>{r.to.join(", ") || "—"}</Mono><span className="text-muted">{Math.round(r.confidence * 100)}%</span></div>
                <p className="mt-0.5 text-muted">{r.explanation}</p>
              </li>
            ))}
          </ul>
        ) : none}
      />
    </Card>
  );
}
