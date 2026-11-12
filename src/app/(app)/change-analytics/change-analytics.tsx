"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BellRing, Check, CheckCircle2, ClipboardCheck, FileSpreadsheet, GitCompareArrows, Grid3x3, Link2, ListChecks, Search, ShieldCheck, Upload, X } from "lucide-react";
import { EmptyState, ErrorState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { CitationDetailSheet } from "@/components/citations/citation-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { useProgressSteps, type ProgressStep } from "@/components/progress-steps";
import { apiGet, apiSend } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import { useMe } from "@/lib/client/use-me";
import { TERMS } from "@/lib/terms";
import { cn, formatNumber } from "@/lib/utils";

type Kind = "UNCHANGED" | "MODIFIED" | "RENUMBERED" | "SPLIT" | "COMBINED" | "ADDED" | "REMOVED";
/** Change types and their colours (also used by the version-change panel on Sources). */
export const KIND: Record<Kind, { label: string; tone: Tone; color: string }> = {
  UNCHANGED: { label: "Unchanged", tone: "success", color: "#1baf7a" },
  ADDED: { label: "Added", tone: "info", color: "#2a78d6" },
  MODIFIED: { label: "Modified", tone: "warning", color: "#eda100" },
  RENUMBERED: { label: "Renumbered", tone: "warning", color: "#c98500" },
  SPLIT: { label: "Split", tone: "warning", color: "#eb6834" },
  COMBINED: { label: "Combined", tone: "warning", color: "#d95926" },
  REMOVED: { label: "Removed", tone: "danger", color: "#d1293d" },
};

interface Flow { status: "AVAILABLE" | "UPDATED" | "REJECTED"; uploadedAfter: boolean; approved: string[]; rejected: string[] }
interface Summary extends Flow {
  key: string; family: string; previous: string; current: string;
  changedTestProcedures: number; totalTestProcedures: number; affectedControls: number; totalControls: number;
}
interface Sec { id: string; doc: string; identifier: string; title: string }
interface Tp { id: string; text: string; removed: Sec[]; added: Sec[] }
interface Detail extends Summary {
  removedSections: number; addedSections: number;
  controls: { controlName: string; title: string | null; totalTestProcedures: number; changed: Tp[] }[];
  families: { family: string; affected: number; total: number }[];
}
type Set_ = (p: Record<string, string>) => void;

const label = (u: Summary) => `${u.family}: ${u.previous} → ${u.current}`;
/** Approval is open once the update is applied in Sources, for controls uploaded before it. */
const approving = (u: Flow) => u.status === "UPDATED" && !u.uploadedAfter;
const pendingOf = (u: Summary) => (approving(u) ? u.affectedControls - u.approved.length - u.rejected.length : 0);
const hintOf = (u: Summary) =>
  u.status === "AVAILABLE" ? "Update not applied yet" : u.status === "REJECTED" ? "Update rejected" : u.uploadedAfter ? "Mapped to the new version"
    : pendingOf(u) ? `${pendingOf(u)} awaiting approval` : "All approved";
/** Distinct sections that changed test procedures stop mapping to ("removed") or start mapping to ("added"), with their users. */
function sectionChanges(d: Detail, side: "removed" | "added") {
  const m = new Map<string, { sec: Sec; uses: { control: string; tp: string }[] }>();
  for (const c of d.controls) for (const tp of c.changed) for (const s of tp[side]) {
    const e = m.get(s.id) ?? { sec: s, uses: [] };
    e.uses.push({ control: c.controlName, tp: tp.id });
    m.set(s.id, e);
  }
  return [...m.values()];
}
const TABS = (d: Detail) => [
  ["controls", `Affected controls (${d.controls.length})`],
  ["procedures", `Changed test procedures (${d.changedTestProcedures})`],
  ["removed", `Sections removed (${sectionChanges(d, "removed").length})`],
  ["added", `Sections added (${sectionChanges(d, "added").length})`],
  ["analytics", "Analytics"],
] as const;

const APPROVE_STEPS = (d: Detail, names: string[]): ProgressStep[] => {
  const tps = d.controls.filter((c) => names.includes(c.controlName)).reduce((n, c) => n + c.changed.length, 0);
  return [
    { icon: ClipboardCheck, title: "Reading test procedures", detail: `${formatNumber(tps)} changed test procedure${tps === 1 ? "" : "s"} across ${names.length} control${names.length === 1 ? "" : "s"}` },
    { icon: GitCompareArrows, title: `Matching to ${d.family} ${d.current}`, detail: "Each procedure matched to the sections of the new version" },
    { icon: Link2, title: "Re-mapping controls", detail: `${d.family} ${d.previous} links retired, ${d.current} links recorded` },
    { icon: ShieldCheck, title: "Mapping complete", detail: `${names.length === 1 ? names[0] : `${names.length} controls`} now point${names.length === 1 ? "s" : ""} to ${d.family} ${d.current}` },
  ];
};

/**
 * Change Analytics: for a framework update (NIST CSF, CIS Controls, ISO/IEC 27001, ISO/IEC 27002), which client test
 * procedures map to different sections in the updated version, which custom controls are affected, and approval of
 * their move to the new version once the update is applied in Sources.
 */
export function ChangeAnalytics() {
  const [s, set] = useUrlState({ update: "", tab: "controls", control: "", q: "", status: "", family: "" });
  const list = useQuery({ queryKey: ["change-analytics", "reference"], queryFn: () => apiGet<{ controlsUploaded: number; updates: Summary[] }>("/api/change-analytics/reference") });
  // Only updates applied in Sources are analysed; ones still on offer or rejected are not shown.
  const updates = (list.data?.updates ?? []).filter((u) => u.status === "UPDATED");
  const selected = updates.find((u) => u.key === s.update)?.key ?? updates.find((u) => pendingOf(u) > 0)?.key ?? updates[0]?.key ?? "";
  const ready = !!list.data?.controlsUploaded && updates.length > 0;
  const detail = useQuery({ queryKey: ["change-analytics", "reference", selected], queryFn: () => apiGet<Detail>(`/api/change-analytics/reference?key=${selected}`), enabled: !!selected && ready });

  return (
    <Page>
      <PageHeader
        title={TERMS.versionImpact}
        description="What changed between a framework's previous version and its updated version, which custom controls are affected, and approval of their mapping to the new version."
        actions={<Button asChild size="sm"><Link href="/controls">Open {TERMS.clientControls} <ArrowRight /></Link></Button>}
      />
      {list.isLoading && <Skeleton className="h-60" />}
      {!!list.error && <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>}
      {list.data && !list.data.controlsUploaded && (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No custom controls uploaded"
            description="Change Analytics shows how framework updates affect the custom controls. Upload the custom control workbook to begin."
            action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>}
          />
        </Card>
      )}
      {list.data && !!list.data.controlsUploaded && !updates.length && (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="No framework updates applied yet"
            description="Once a framework update is applied in Sources, the custom controls it affects are listed here for approval."
            action={<Button asChild variant="primary"><Link href="/sources">Go to {TERMS.sources} <ArrowRight /></Link></Button>}
          />
        </Card>
      )}
      {list.data && ready && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-xs text-muted">Framework update</span>
            <Select
              value={selected} onChange={(v) => set({ update: v, control: "", q: "", status: "", family: "" })} aria-label="Framework update" triggerClassName="min-w-[320px]"
              options={updates.map((u) => ({ value: u.key, label: label(u), hint: hintOf(u) }))}
            />
          </Card>
          {detail.isLoading && <Skeleton className="h-80" />}
          {!!detail.error && <Card><ErrorState error={detail.error} onRetry={detail.refetch} /></Card>}
          {detail.data && <UpdateView d={detail.data} tab={s.tab} control={s.control} filters={{ q: s.q, status: s.status, family: s.family }} set={set} />}
        </div>
      )}
    </Page>
  );
}

/** Approves controls' move to the new version, with the mapping animation. */
function useApprove(d: Detail) {
  const qc = useQueryClient();
  const router = useRouter();
  // A review changes what every page shows for these controls: refetch this page's data and drop the browser's copies
  // of server-rendered pages (control pages, Sources, the library, the sidebar badge) so they are current everywhere.
  const refreshEverywhere = async () => {
    await qc.invalidateQueries();
    router.refresh();
  };
  const progress = useProgressSteps();
  const approve = async (names: string[]) => {
    if (!names.length) return;
    try {
      await progress.run(`Approving ${names.length === 1 ? names[0] : `${names.length} controls`}`, APPROVE_STEPS(d, names), () => apiSend("/api/demo", { action: "approve", key: d.key, controls: names }),
        names.length > 14 ? [...names.slice(0, 13), `+${names.length - 13} more`] : names);
      // An approved control is on the new version everywhere: offer its page (traceability) or the control register.
      toast.success(`${names.length === 1 ? names[0] : `${names.length} controls`} mapped to ${d.family} ${d.current}`, {
        action: names.length === 1
          ? { label: "Open control", onClick: () => router.push(`/controls/${encodeURIComponent(names[0])}`) }
          : { label: `Open ${TERMS.clientControls}`, onClick: () => router.push("/controls") },
      });
      await refreshEverywhere();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    }
  };
  // Rejecting keeps controls on the previous version; reconsidering undoes an approval or a rejection. Neither is permanent.
  const review = async (action: "reject-controls" | "reconsider-controls", names: string[]) => {
    if (!names.length) return;
    const who = names.length === 1 ? names[0] : `${names.length} controls`;
    try {
      await apiSend("/api/demo", { action, key: d.key, controls: names });
      if (action === "reject-controls") toast.info(`${who} rejected`, { description: `Stays on ${d.family} ${d.previous}. You can reconsider it at any time.` });
      else toast.info(`${who} back to awaiting approval`);
      await refreshEverywhere();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };
  return { approve, reject: (n: string[]) => review("reject-controls", n), reconsider: (n: string[]) => review("reconsider-controls", n), overlay: progress.overlay, running: progress.running };
}

function FlowBanner({ d, onApproveAll, running }: { d: Detail; onApproveAll: () => void; running: boolean }) {
  const canWrite = !!useMe().data?.canWrite;
  const pending = pendingOf(d);
  const box = (tone: "warning" | "success" | "neutral", icon: React.ReactNode, body: React.ReactNode, action?: React.ReactNode) => (
    <Card className={cn(tone === "warning" && "border-warning/50 bg-warning-soft/30", tone === "success" && "border-success/40 bg-success-soft/40")}>
      <CardBody className="flex flex-wrap items-center gap-3 text-[13px]">{icon}<span className="min-w-0 flex-1">{body}</span>{action}</CardBody>
    </Card>
  );
  if (d.status === "AVAILABLE")
    return box("warning", <BellRing className="size-4 text-warning" />,
      <><b>Update available: {d.family} {d.current}.</b> The custom controls stay on {d.previous} until the update is applied in Sources; their mappings can then be approved here.</>,
      <Button asChild size="sm" variant="primary"><Link href="/sources?status=AVAILABLE">Go to Sources <ArrowRight /></Link></Button>);
  if (d.status === "REJECTED")
    return box("neutral", <X className="size-4 text-muted" />, <><b>Update rejected in Sources.</b> The custom controls stay on {d.family} {d.previous}.</>);
  if (d.uploadedAfter)
    return box("success", <CheckCircle2 className="size-4 text-success" />, <><b>Controls map to {d.family} {d.current}.</b> They were uploaded after the update was applied, so there is nothing to approve.</>);
  if (!pending && d.rejected.length)
    return box("warning", <CheckCircle2 className="size-4 text-warning" />, <><b>All {formatNumber(d.affectedControls)} affected controls reviewed.</b> {formatNumber(d.approved.length)} approved and now on {d.family} {d.current}; {formatNumber(d.rejected.length)} rejected and kept on {d.previous}. A rejected control can be reconsidered at any time.</>);
  if (!pending)
    return box("success", <CheckCircle2 className="size-4 text-success" />, <><b>All {formatNumber(d.affectedControls)} affected controls approved.</b> They now point to {d.family} {d.current}.</>,
      <Button asChild size="sm" variant="primary"><Link href="/controls">Open {TERMS.clientControls} <ArrowRight /></Link></Button>);
  return box("warning", <BellRing className="size-4 text-warning" />,
    <><b>{formatNumber(pending)} of {formatNumber(d.affectedControls)} affected controls await approval.</b> Approved controls move to {d.family} {d.current}; the rest stay on {d.previous}.{d.rejected.length ? ` ${formatNumber(d.rejected.length)} rejected.` : ""}</>,
    canWrite && <Button size="sm" variant="primary" disabled={running} onClick={onApproveAll}><Check /> Approve all ({formatNumber(pending)})</Button>);
}

interface Filters { q: string; status: string; family: string }
const familyOfControl = (name: string) => name.split("-")[0];

/** Filters for the controls and test procedures: search, approval status and control family. */
function FilterBar({ d, f, set, shown }: { d: Detail; f: Filters; set: Set_; shown: number }) {
  const [q, setQ] = useState(f.q);
  const dq = useDebounced(q, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (dq !== f.q) set({ q: dq, control: "" }); }, [dq]);
  useEffect(() => { setQ(f.q); }, [f.q]);
  const families = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of d.controls) m.set(familyOfControl(c.controlName), (m.get(familyOfControl(c.controlName)) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [d.controls]);
  const active = !!(f.q || f.status || f.family);
  return (
    <Card className="flex flex-wrap items-center gap-2 p-3">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search control, title or section (e.g. ID.AM-03)…" className="pl-8" aria-label="Search controls and sections" />
      </div>
      <Select
        value={f.status} onChange={(v) => set({ status: v, control: "" })} allLabel="Any approval status" aria-label="Approval status"
        options={[{ value: "awaiting", label: "Awaiting approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]}
      />
      <Select
        value={f.family} onChange={(v) => set({ family: v, control: "" })} allLabel="All control families" aria-label="Control family"
        options={families.map(([value, n]) => ({ value, label: value, hint: n }))}
      />
      {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", status: "", family: "", control: "" }); }}><X /> Clear</Button>}
      <span className="ml-auto text-xs tabular text-muted">{shown} of {d.controls.length} affected controls</span>
    </Card>
  );
}

function UpdateView({ d: full, tab, control, filters, set }: { d: Detail; tab: string; control: string; filters: Filters; set: Set_ }) {
  // Controls matching the filters; everything below works on this view.
  const d = useMemo<Detail>(() => {
    const done = new Set(full.approved), no = new Set(full.rejected);
    const all = full.status === "UPDATED" && full.uploadedAfter;
    const stateOf = (name: string) => (all || done.has(name) ? "approved" : no.has(name) ? "rejected" : "awaiting");
    const q = filters.q.trim().toLowerCase();
    const controls = full.controls.filter((c) =>
      (!filters.family || familyOfControl(c.controlName) === filters.family) &&
      (!filters.status || filters.status === stateOf(c.controlName)) &&
      (!q || `${c.controlName} ${c.title ?? ""}`.toLowerCase().includes(q) ||
        c.changed.some((t) => [...t.added, ...t.removed].some((x) => `${x.identifier} ${x.title}`.toLowerCase().includes(q)))));
    return { ...full, controls, changedTestProcedures: controls.reduce((n, c) => n + c.changed.length, 0) };
  }, [full, filters.q, filters.status, filters.family]);
  const filtered = !!(filters.q || filters.status || filters.family);
  const { approve, reject, reconsider, overlay, running } = useApprove(d);
  const approved = new Set(d.approved), rejectedSet = new Set(d.rejected);
  // A tapped card opens its list below and scrolls to it; an open control detail is closed.
  const go = (p: Record<string, string>) => {
    set({ control: "", ...p });
    setTimeout(() => document.getElementById("ca-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  return (
    <>
      {overlay}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-10 gap-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{d.family} version transition</div>
            <div className="mt-1 flex items-center gap-3">
              <div><div className="text-[11px] text-muted">Previous version</div><div className="text-2xl font-semibold tabular text-fg">{d.previous}</div></div>
              <ArrowRight className="size-5 text-subtle" />
              <div><div className="text-[11px] text-muted">Updated version</div><div className="text-2xl font-semibold tabular text-fg">{d.current}</div></div>
            </div>
          </div>
          <button type="button" onClick={() => go({ tab: "controls", status: "" })} title="Show the affected controls" className={TAP}>
            <div className={cn("text-2xl font-semibold tabular", d.affectedControls ? "text-warning" : "text-fg")}>{d.affectedControls}</div><div className="text-[11px] text-muted">Affected custom controls</div>
          </button>
          {approving(d) && (
            <button type="button" onClick={() => go({ tab: "controls", status: "approved" })} title="Show the approved controls" className={TAP}>
              <div className="text-2xl font-semibold tabular text-success">{d.approved.length}</div><div className="text-[11px] text-muted">Approved</div>
            </button>
          )}
          <Link href="/controls" title={`Open all custom controls in ${TERMS.clientControls}`} className={TAP}>
            <div className="text-2xl font-semibold tabular text-fg">{d.totalControls}</div><div className="text-[11px] text-muted">Total custom controls</div>
          </Link>
        </CardBody>
      </Card>

      <FlowBanner d={d} running={running} onApproveAll={() => approve(d.controls.map((c) => c.controlName).filter((n) => !approved.has(n) && !rejectedSet.has(n)))} />

      <StatStrip
        className="xl:grid-cols-5"
        items={[
          { label: "Affected controls", value: d.affectedControls, tone: d.affectedControls ? "warning" : "default", sub: `of ${formatNumber(d.totalControls)} custom controls`, onClick: () => go({ tab: "controls" }), active: tab === "controls" },
          { label: "Test procedures changed", value: full.changedTestProcedures, tone: full.changedTestProcedures ? "warning" : "default", sub: `of ${formatNumber(d.totalTestProcedures)}`, onClick: () => go({ tab: "procedures" }), active: tab === "procedures" },
          { label: "Test procedures unchanged", value: d.totalTestProcedures - full.changedTestProcedures, tone: "success", sub: "Same sections in both versions · see Analytics", onClick: () => go({ tab: "analytics" }), active: tab === "analytics" },
          { label: "Sections removed from mappings", value: d.removedSections, hint: "Distinct sections of the previous version that changed test procedures no longer map to", onClick: () => go({ tab: "removed" }), active: tab === "removed" },
          { label: "Sections added to mappings", value: d.addedSections, hint: "Distinct sections of the updated version that changed test procedures now map to", onClick: () => go({ tab: "added" }), active: tab === "added" },
        ]}
      />

      {tab !== "analytics" && <FilterBar d={full} f={filters} set={set} shown={d.controls.length} />}
      <div id="ca-tabs" className="flex scroll-mt-4 flex-wrap gap-1">
        {TABS(d).map(([id, text]) => (
          <button key={id} onClick={() => set({ tab: id })} className={cn("rounded-md border px-3 py-1.5 text-xs", tab === id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>{text}</button>
        ))}
      </div>
      {tab === "controls" && <AffectedControls d={d} selected={control} set={set} approve={approve} reject={reject} reconsider={reconsider} running={running} filtered={filtered} />}
      {tab === "procedures" && <ChangedProcedures d={d} set={set} />}
      {(tab === "removed" || tab === "added") && <SectionChanges d={d} side={tab} set={set} />}
      {tab === "analytics" && <Analytics d={full} />}
    </>
  );
}

/** The sections of the framework being updated; mappings to other frameworks are listed apart from them. */
const inFamily = (d: Detail, s: Sec) => s.doc.startsWith(d.family);

/** A list of sections: identifier, title and version, each one opening its detail panel. */
function SectionList({ items, tone, onOpen }: { items: Sec[]; tone: "removed" | "added"; onOpen: (s: Sec) => void }) {
  if (!items.length) return <span className="text-xs text-subtle">None</span>;
  return (
    <ul className="space-y-1">
      {items.map((s) => (
        <li key={s.id}>
          <button
            onClick={() => onOpen(s)} title="Open section details"
            className={cn("flex w-full items-baseline gap-2 rounded border px-2 py-1 text-left text-xs transition-colors",
              tone === "removed" ? "border-danger/25 bg-danger-soft/40 hover:bg-danger-soft/70" : "border-success/30 bg-success-soft/50 hover:bg-success-soft/80")}
          >
            <span className={cn("shrink-0 font-mono font-medium text-fg", tone === "removed" && "line-through decoration-danger/40")}>{s.identifier}</span>
            <span className="line-clamp-1 min-w-0 flex-1 text-muted">{s.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Removed or added sections of a test procedure: the updated framework first, other frameworks collapsed. */
function MappingColumn({ d, items, tone, onOpen }: { d: Detail; items: Sec[]; tone: "removed" | "added"; onOpen: (s: Sec) => void }) {
  const main = items.filter((s) => inFamily(d, s)), other = items.filter((s) => !inFamily(d, s));
  const version = main[0]?.doc ?? `${d.family} ${tone === "removed" ? d.previous : d.current}`;
  return (
    <div className={cn("rounded border p-3 text-xs", tone === "removed" ? "border-border bg-surface-2" : "border-success/30 bg-success-soft/30")}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{tone === "removed" ? (d.uploadedAfter && d.status === "UPDATED" ? "Previously" : "Maps to now") : d.uploadedAfter && d.status === "UPDATED" ? "Maps to" : "Will map to"} · {version}</div>
      <SectionList items={main} tone={tone} onOpen={onOpen} />
      {other.length > 0 && (
        <details className="mt-2 text-muted">
          <summary className="cursor-pointer text-[11px] font-medium hover:text-fg">Also {tone === "removed" ? "mapped before" : "mapped after"} in other frameworks ({other.length})</summary>
          <div className="mt-1.5"><SectionList items={other} tone={tone} onOpen={onOpen} /></div>
        </details>
      )}
    </div>
  );
}

/** One plain sentence on what changes for the control and what approving does. */
function ControlSummary({ d, c }: { d: Detail; c: Detail["controls"][number] }) {
  const added = [...new Map(c.changed.flatMap((t) => t.added).filter((s) => inFamily(d, s)).map((s) => [s.id, s])).values()];
  const shown = added.slice(0, 4).map((s) => s.identifier).join(", ");
  if (d.uploadedAfter)
    return <><b className="text-fg-2">{c.controlName}</b> was uploaded after {d.family} {d.current} was installed, so it already maps to {d.family} {d.current}{shown ? ` (${shown}${added.length > 4 ? ` and ${added.length - 4} more` : ""})` : ""}. Nothing to approve. The sections below show what changed from {d.previous} for reference.</>;
  return (
    <>
      <b className="text-fg-2">{c.controlName}</b> has {c.totalTestProcedures} test procedure{c.totalTestProcedures === 1 ? "" : "s"}; {c.changed.length} map{c.changed.length === 1 ? "s" : ""} to different sections in {d.family} {d.current}.{" "}
      {added.length ? <>Approving moves {c.changed.length === 1 ? "it" : "them"} from {d.family} {d.previous} to {d.family} {d.current} ({shown}{added.length > 4 ? ` and ${added.length - 4} more` : ""}). The test procedures themselves stay the same.</>
        : <>Only its mappings to other frameworks changed; approving records the move to {d.family} {d.current}.</>}
    </>
  );
}

type Panel = { kind: "section"; id: string } | { kind: "tp"; control: string; tp: Tp } | null;

/** Right-hand panel for one test procedure: its full text and everything that moves in its mapping. */
function ProcedurePanel({ d, panel, onClose, onSection }: { d: Detail; panel: Extract<Panel, { kind: "tp" }> | null; onClose: () => void; onSection: (s: Sec) => void }) {
  const tp = panel?.tp;
  const group = (items: Sec[]) => {
    const by = new Map<string, Sec[]>();
    for (const s of items) by.set(s.doc || "Other", [...(by.get(s.doc || "Other") ?? []), s]);
    return [...by].sort((a, b) => Number(b[0].startsWith(d.family)) - Number(a[0].startsWith(d.family)));
  };
  return (
    <Sheet
      open={!!panel} onOpenChange={(o) => !o && onClose()}
      title={tp ? <span className="font-mono">{tp.id}</span> : "Test procedure"}
      description={panel ? `Control ${panel.control} · ${d.family} ${d.previous} → ${d.current}` : undefined}
    >
      {tp && (
        <div className="space-y-5 p-5">
          <section>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Test procedure</div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{tp.text || "No description recorded."}</p>
            <p className="mt-2 text-xs text-muted">The procedure does not change. Only the framework sections it maps to do.</p>
          </section>
          {([["removed", "Maps to now (removed)", tp.removed], ["added", "Will map to (added)", tp.added]] as const).map(([tone, label, items]) => (
            <section key={tone}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label} · {items.length}</div>
              {group(items).map(([doc, list]) => (
                <div key={doc} className="mb-3">
                  <div className="mb-1 text-[11px] font-medium text-fg-2">{doc}</div>
                  <SectionList items={list} tone={tone} onOpen={onSection} />
                </div>
              ))}
              {!items.length && <span className="text-xs text-subtle">None</span>}
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Only the controls with a changed test procedure. Selecting one shows those procedures with what moved in their
 * mapping; a procedure or a section opens a detail panel on the right. Once the update is applied, each control can be
 * approved on its own or several at once.
 */
function AffectedControls({ d, selected, set, approve, reject, reconsider, running, filtered }: { d: Detail; selected: string; set: Set_; approve: (names: string[]) => Promise<void>; reject: (names: string[]) => Promise<void>; reconsider: (names: string[]) => Promise<void>; running: boolean; filtered: boolean }) {
  const canWrite = !!useMe().data?.canWrite;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>(null);
  const open = d.controls.find((c) => c.controlName === selected) ?? d.controls[0] ?? null;
  const approved = new Set(d.approved), rejected = new Set(d.rejected);
  const mode = approving(d) && canWrite;
  // Controls still to be decided (neither approved nor rejected).
  const open_ = d.controls.filter((c) => !approved.has(c.controlName) && !rejected.has(c.controlName)).map((c) => c.controlName);
  const toggle = (n: string) => setPicked((x) => { const y = new Set(x); if (y.has(n)) y.delete(n); else y.add(n); return y; });
  const run = async (names: string[]) => { await approve(names); setPicked(new Set()); };
  const runReject = async (names: string[]) => { await reject(names); setPicked(new Set()); };
  const openSection = (s: Sec) => setPanel({ kind: "section", id: s.id });
  if (!d.controls.length)
    return filtered
      ? <Card><EmptyState icon={Search} title="No controls match" description="Change or clear the filters." /></Card>
      : <Card><EmptyState icon={ListChecks} title="No custom controls are affected" description="No custom test procedure maps to different sections in this version." /></Card>;
  const disabledWhy = d.status !== "UPDATED" ? "Apply the update in Sources first" : d.uploadedAfter ? "Already mapped to the new version" : !canWrite ? "Your role cannot approve mappings" : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <CitationDetailSheet citationId={panel?.kind === "section" ? panel.id : null} onClose={() => setPanel(null)} onOpen={(id) => setPanel({ kind: "section", id })} />
      <ProcedurePanel d={d} panel={panel?.kind === "tp" ? panel : null} onClose={() => setPanel(null)} onSection={openSection} />
      <Card className="self-start">
        <CardHeader
          title={`Affected controls (${d.controls.length} of ${filtered ? d.affectedControls : d.totalControls})`}
          description={mode ? "Click any control to inspect what changed, then approve or reject it" : "Click any control to inspect what changed"}
          actions={mode && open_.length > 0 && (
            <span className="flex gap-1.5">
              <Button size="sm" disabled={running || !picked.size} onClick={() => runReject([...picked])}><X /> Reject{picked.size ? ` (${picked.size})` : ""}</Button>
              <Button size="sm" variant="primary" disabled={running || !picked.size} onClick={() => run([...picked])}><Check /> Approve{picked.size ? ` (${picked.size})` : ""}</Button>
            </span>
          )}
        />
        {mode && open_.length > 0 && (
          <label className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">
            <input type="checkbox" className="size-4 accent-[#2e2e38]" checked={open_.every((n) => picked.has(n))} onChange={(e) => setPicked(e.target.checked ? new Set(open_) : new Set())} />
            Select all awaiting approval ({open_.length})
          </label>
        )}
        <ul className="max-h-[640px] divide-y divide-border overflow-auto">
          {d.controls.map((c) => {
            const ok = approved.has(c.controlName) || (d.status === "UPDATED" && d.uploadedAfter);
            const no = !ok && rejected.has(c.controlName);
            return (
              <li key={c.controlName} className={cn("flex items-start gap-2 px-4 py-2.5 text-xs", open?.controlName === c.controlName && "bg-accent-soft/50", ok && approving(d) && "bg-success-soft/40", no && "bg-warning-soft/40")}>
                {mode && (ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : no ? <X className="mt-0.5 size-4 shrink-0 text-warning" /> : (
                  <input type="checkbox" aria-label={`Select ${c.controlName}`} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#2e2e38]" checked={picked.has(c.controlName)} onChange={() => toggle(c.controlName)} />
                ))}
                <button onClick={() => set({ control: c.controlName })} className="group min-w-0 flex-1 text-left">
                  <div className="font-mono font-medium text-fg underline-offset-2 group-hover:text-accent group-hover:underline">{c.controlName}</div>
                  {c.title && <div className="line-clamp-2 text-muted">{c.title}</div>}
                  <div className="mt-1"><Badge tone={ok && approving(d) ? "success" : d.uploadedAfter ? "neutral" : "warning"}>{c.changed.length} of {c.totalTestProcedures} changed{d.status === "UPDATED" && d.uploadedAfter ? " · mapped on upload" : ""}</Badge></div>
                </button>
                {mode && (ok ? (
                  <span className="flex flex-col items-end gap-1">
                    <Badge tone="success"><Check /> Approved</Badge>
                    <Link href={`/controls/${encodeURIComponent(c.controlName)}`} title="Open this control: traceability, test procedures and mappings" className="inline-flex items-center gap-1 text-[11px] font-medium text-success hover:underline">Open control <ArrowRight className="size-3" /></Link>
                    <Button size="sm" variant="ghost" disabled={running} onClick={() => reconsider([c.controlName])}>Undo</Button>
                  </span>
                ) : no ? (
                  <span className="flex flex-col items-end gap-1">
                    <Badge tone="warning"><X /> Rejected</Badge>
                    <Button size="sm" variant="ghost" disabled={running} onClick={() => reconsider([c.controlName])}>Reconsider</Button>
                  </span>
                ) : (
                  <span className="flex flex-col gap-1">
                    <Button size="sm" disabled={running} onClick={() => run([c.controlName])}>Approve</Button>
                    <Button size="sm" variant="ghost" disabled={running} onClick={() => reject([c.controlName])}>Reject</Button>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      </Card>
      {open && (
        <Card>
          <CardHeader
            title={<span className="font-mono">{open.controlName}</span>}
            description={open.title ?? undefined}
            actions={d.status === "UPDATED" && d.uploadedAfter ? (
              <Badge tone="success"><Check /> Mapped to {d.family} {d.current} on upload</Badge>
            ) : approved.has(open.controlName) ? (
              <span className="flex items-center gap-2">
                <Badge tone="success"><Check /> Approved · {d.family} {d.current}</Badge>
                <Button size="sm" variant="ghost" disabled={running || !!disabledWhy} title={disabledWhy ?? "Put this control back to awaiting approval"} onClick={() => reconsider([open.controlName])}>Undo</Button>
                <Button asChild size="sm" variant="primary"><Link href={`/controls/${encodeURIComponent(open.controlName)}`}>Open control · Traceability <ArrowRight /></Link></Button>
              </span>
            ) : rejected.has(open.controlName) ? (
              <span className="flex items-center gap-2">
                <Badge tone="warning"><X /> Rejected · stays on {d.family} {d.previous}</Badge>
                <Button size="sm" variant="ghost" disabled={running || !!disabledWhy} title={disabledWhy ?? "Put this control back to awaiting approval"} onClick={() => reconsider([open.controlName])}>Reconsider</Button>
                <Button size="sm" variant="primary" disabled={running || !!disabledWhy} title={disabledWhy} onClick={() => run([open.controlName])}><Check /> Approve and Move</Button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Button size="sm" disabled={running || !!disabledWhy} title={disabledWhy ?? "Keep this control on the previous version"} onClick={() => reject([open.controlName])}><X /> Reject</Button>
                <Button size="sm" variant="primary" disabled={running || !!disabledWhy} title={disabledWhy} onClick={() => run([open.controlName])}><Check /> Approve and Move</Button>
              </span>
            )}
          />
          <div className="border-b border-border bg-surface-2 px-4 py-2.5 text-xs leading-relaxed text-muted"><ControlSummary d={d} c={open} /></div>
          <div className="divide-y divide-border">
            {open.changed.map((tp) => (
              <div key={tp.id} className="p-4">
                <button onClick={() => setPanel({ kind: "tp", control: open.controlName, tp })} title="Open this test procedure" className="mb-2 flex w-full items-start gap-2 rounded text-left hover:bg-surface-2">
                  <Mono className="whitespace-nowrap text-xs font-medium text-fg">{tp.id}</Mono>
                  <p className="line-clamp-3 flex-1 text-xs text-muted">{tp.text}</p>
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                </button>
                <div className="grid gap-3 md:grid-cols-2">
                  <MappingColumn d={d} items={tp.removed} tone="removed" onOpen={openSection} />
                  <MappingColumn d={d} items={tp.added} tone="added" onOpen={openSection} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const PAGE = 100;

/** Tappable figure in the version-transition card. */
const TAP = "-m-1.5 block rounded-md p-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

/**
 * The distinct sections changed test procedures stop mapping to (removed) or start mapping to (added): the updated
 * framework first, then other frameworks, each with the controls and test procedures behind it.
 */
function SectionChanges({ d, side, set }: { d: Detail; side: "removed" | "added"; set: Set_ }) {
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => sectionChanges(d, side).sort((a, b) =>
    Number(inFamily(d, b.sec)) - Number(inFamily(d, a.sec)) || a.sec.doc.localeCompare(b.sec.doc) || a.sec.identifier.localeCompare(b.sec.identifier, undefined, { numeric: true })), [d, side]);
  if (!rows.length) return <Card><EmptyState icon={ListChecks} title={`No sections ${side}`} description={side === "removed" ? "No changed test procedure stops mapping to a section." : "No changed test procedure starts mapping to a new section."} /></Card>;
  const removed = side === "removed";
  return (
    <Card>
      <CardHeader
        title={removed ? `Sections removed from mappings · ${d.family} ${d.previous} and others` : `Sections added to mappings · ${d.family} ${d.current} and others`}
        description={removed ? "Sections that changed test procedures map to now and no longer map to once approved." : "Sections that changed test procedures map to once approved."}
      />
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface-2">
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Section</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Framework</th><th className="px-4 py-2">Used by</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(({ sec, uses }) => {
              const controls = [...new Set(uses.map((u) => u.control))];
              return (
                <tr key={sec.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2">
                    <button onClick={() => setOpen(sec.id)} title="Open section details" className={cn("rounded border px-1.5 py-0.5 font-mono font-medium text-fg transition-colors", removed ? "border-danger/25 bg-danger-soft/40 line-through decoration-danger/40 hover:bg-danger-soft/70" : "border-success/30 bg-success-soft/50 hover:bg-success-soft/80")}>{sec.identifier}</button>
                  </td>
                  <td className="max-w-[360px] px-3 py-2 text-muted"><div className="line-clamp-2">{sec.title}</div></td>
                  <td className="whitespace-nowrap px-3 py-2 text-fg-2">{sec.doc}</td>
                  <td className="px-4 py-2">
                    <div className="mb-1 text-[11px] text-muted">{uses.length} test procedure{uses.length === 1 ? "" : "s"} · {controls.length} control{controls.length === 1 ? "" : "s"}</div>
                    <div className="flex flex-wrap gap-1">
                      {controls.slice(0, 8).map((c) => (
                        <button key={c} onClick={() => set({ tab: "controls", control: c })} title="Open this control" className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-fg-2 hover:border-border-strong hover:text-fg">{c}</button>
                      ))}
                      {controls.length > 8 && <span className="px-1 text-[11px] text-subtle">+{controls.length - 8} more</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <Button size="sm" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button>
          <Button size="sm" variant="ghost" onClick={() => setLimit(rows.length)}>Show all {formatNumber(rows.length)}</Button>
          <span className="ml-auto tabular text-muted">{formatNumber(limit)} of {formatNumber(rows.length)}</span>
        </div>
      )}
      <CitationDetailSheet citationId={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </Card>
  );
}

/** Every changed test procedure with its control. */
function ChangedProcedures({ d, set }: { d: Detail; set: Set_ }) {
  const [limit, setLimit] = useState(PAGE);
  const rows = d.controls.flatMap((c) => c.changed.map((tp) => ({ control: c.controlName, tp })));
  if (!rows.length) return <Card><EmptyState icon={ListChecks} title="No test procedures changed" description="Every test procedure maps to the same sections in both versions." /></Card>;
  return (
    <Card>
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface-2">
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Control</th><th className="px-3 py-2">Test procedure</th><th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Removed</th><th className="px-4 py-2 text-right">Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(({ control, tp }) => (
              <tr key={tp.id} onClick={() => set({ tab: "controls", control })} className="cursor-pointer border-b border-border align-top last:border-0 hover:bg-surface-2">
                <td className="whitespace-nowrap px-4 py-2 font-mono font-medium text-fg">{control}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-fg-2">{tp.id}</td>
                <td className="max-w-[460px] px-3 py-2 text-muted"><div className="line-clamp-2">{tp.text}</div></td>
                <td className="px-3 py-2 text-right tabular text-danger">{tp.removed.length}</td>
                <td className="px-4 py-2 text-right tabular text-success">{tp.added.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <Button size="sm" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button>
          <Button size="sm" variant="ghost" onClick={() => setLimit(rows.length)}>Show all {formatNumber(rows.length)}</Button>
          <span className="ml-auto tabular text-muted">{formatNumber(limit)} of {formatNumber(rows.length)}</span>
        </div>
      )}
    </Card>
  );
}

/** How much of the client's control set the update touches, overall and by control family. */
function Analytics({ d }: { d: Detail }) {
  const unaffected = d.totalControls - d.affectedControls;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="Impact by control family" description="Controls with at least one changed test procedure, per family (the letters before the first dash in a control ID)" icon={<Grid3x3 />} />
        <div className="overflow-auto p-4">
          <table className="w-full text-xs">
            <tbody>
              {d.families.map((f) => (
                <tr key={f.family}>
                  <th className="w-20 py-1 pr-2 text-left font-mono font-medium text-fg-2">{f.family}</th>
                  <td className="py-1">
                    <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" title={`${f.affected} of ${f.total} controls affected`}>
                      <div style={{ width: `${(f.affected / f.total) * 100}%`, background: KIND.REMOVED.color }} />
                    </div>
                  </td>
                  <td className="w-24 py-1 pl-3 text-right tabular text-fg-2">{f.affected} / {f.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Custom control impact" description="All custom controls" />
        <CardBody className="space-y-3 text-xs">
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
            <div style={{ width: `${(d.affectedControls / d.totalControls) * 100}%`, background: KIND.REMOVED.color }} />
            <div style={{ width: `${(unaffected / d.totalControls) * 100}%`, background: KIND.UNCHANGED.color }} />
          </div>
          <div className="flex justify-between">
            <span><span style={{ color: KIND.REMOVED.color }}>■</span> Affected {d.affectedControls}</span>
            <span><span style={{ color: KIND.UNCHANGED.color }}>■</span> Unaffected {unaffected}</span>
          </div>
          <div className="border-t border-border pt-2">
            <div className="flex justify-between py-0.5"><span className="text-muted">Test procedures changed</span><span className="tabular text-fg">{d.changedTestProcedures}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-muted">Test procedures unchanged</span><span className="tabular text-fg">{d.totalTestProcedures - d.changedTestProcedures}</span></div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
