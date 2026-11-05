"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BellRing, Check, Grid3x3, ListChecks } from "lucide-react";
import { EmptyState, ErrorState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
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

interface Summary {
  key: string; family: string; previous: string; current: string;
  changedTestProcedures: number; totalTestProcedures: number; affectedControls: number; totalControls: number;
}
interface Sec { doc: string; identifier: string; title: string }
interface Tp { id: string; text: string; removed: Sec[]; added: Sec[] }
interface Detail extends Summary {
  removedSections: number; addedSections: number;
  controls: { controlName: string; title: string | null; totalTestProcedures: number; changed: Tp[] }[];
  families: { family: string; affected: number; total: number }[];
}

const label = (u: Summary) => `${u.family}: ${u.previous} → ${u.current}`;
const TABS = (d: Detail) => [["controls", `Affected controls (${d.controls.length})`], ["procedures", `Changed test procedures (${d.changedTestProcedures})`], ["analytics", "Analytics"]] as const;

/**
 * Change Analytics: for a framework update (ISO 27701, ISO 27001, ISO 27002, NIST CSF, CIS Controls), which client test
 * procedures map to different sections in the updated version, and so which client controls are affected.
 */
export function ChangeAnalytics() {
  const [s, set] = useUrlState({ update: "", tab: "controls", control: "" });
  const list = useQuery({ queryKey: ["change-analytics", "reference"], queryFn: () => apiGet<Summary[]>("/api/change-analytics/reference") });
  const selected = list.data?.find((u) => u.key === s.update)?.key ?? list.data?.[0]?.key ?? "";
  const detail = useQuery({ queryKey: ["change-analytics", "reference", selected], queryFn: () => apiGet<Detail>(`/api/change-analytics/reference?key=${selected}`), enabled: !!selected });

  return (
    <Page>
      <PageHeader title={TERMS.versionImpact} description="What changed between a framework's previous version and its updated version, and which client controls are affected. Each client test procedure is compared by the sections it maps to in each version." />
      {list.isLoading && <Skeleton className="h-60" />}
      {!!list.error && <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>}
      {list.data && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-xs text-muted">Framework update</span>
            <Select
              value={selected} onChange={(v) => set({ update: v, control: "" })} aria-label="Framework update" triggerClassName="min-w-[320px]"
              options={list.data.map((u) => ({ value: u.key, label: label(u), hint: `${u.affectedControls} controls affected` }))}
            />
          </Card>
          {detail.isLoading && <Skeleton className="h-80" />}
          {!!detail.error && <Card><ErrorState error={detail.error} onRetry={detail.refetch} /></Card>}
          {detail.data && <UpdateView d={detail.data} tab={s.tab} control={s.control} set={set} />}
        </div>
      )}
    </Page>
  );
}

function UpdateView({ d, tab, control, set }: { d: Detail; tab: string; control: string; set: (p: Record<string, string>) => void }) {
  return (
    <>
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
          <div><div className={cn("text-2xl font-semibold tabular", d.affectedControls ? "text-warning" : "text-fg")}>{d.affectedControls}</div><div className="text-[11px] text-muted">Affected client controls</div></div>
          <div><div className="text-2xl font-semibold tabular text-fg">{d.totalControls}</div><div className="text-[11px] text-muted">Total client controls</div></div>
        </CardBody>
      </Card>

      <Card className={d.affectedControls ? "border-warning/50 bg-warning-soft/30" : undefined}>
        <CardBody className="flex flex-wrap items-center gap-3 text-[13px]">
          {d.affectedControls ? <BellRing className="size-4 text-warning" /> : <Check className="size-4 text-success" />}
          <span className="flex-1">
            {d.affectedControls
              ? <><b>{formatNumber(d.affectedControls)} of {formatNumber(d.totalControls)} client controls are affected.</b> {formatNumber(d.changedTestProcedures)} of their test procedures map to different sections in {d.family} {d.current}.</>
              : <><b>No client control is affected.</b> Every test procedure maps to the same sections in both versions.</>}
          </span>
          {d.affectedControls > 0 && tab !== "controls" && <Button size="sm" variant="primary" onClick={() => set({ tab: "controls" })}>Review affected controls</Button>}
        </CardBody>
      </Card>

      <StatStrip
        className="xl:grid-cols-5"
        items={[
          { label: "Affected controls", value: d.affectedControls, tone: d.affectedControls ? "warning" : "default", sub: `of ${formatNumber(d.totalControls)} client controls` },
          { label: "Test procedures changed", value: d.changedTestProcedures, tone: d.changedTestProcedures ? "warning" : "default", sub: `of ${formatNumber(d.totalTestProcedures)}` },
          { label: "Test procedures unchanged", value: d.totalTestProcedures - d.changedTestProcedures, tone: "success", sub: "Same sections in both versions" },
          { label: "Sections removed from mappings", value: d.removedSections, hint: "Distinct sections of the previous version that changed test procedures no longer map to" },
          { label: "Sections added to mappings", value: d.addedSections, hint: "Distinct sections of the updated version that changed test procedures now map to" },
        ]}
      />

      <div className="flex flex-wrap gap-1">
        {TABS(d).map(([id, text]) => (
          <button key={id} onClick={() => set({ tab: id })} className={cn("rounded-md border px-3 py-1.5 text-xs", tab === id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>{text}</button>
        ))}
      </div>
      {tab === "controls" && <AffectedControls d={d} selected={control} set={set} />}
      {tab === "procedures" && <ChangedProcedures d={d} set={set} />}
      {tab === "analytics" && <Analytics d={d} />}
    </>
  );
}

/** Sections grouped by framework, as identifier chips (the title is on hover). */
function Sections({ items, tone }: { items: Sec[]; tone: "removed" | "added" }) {
  if (!items.length) return <span className="text-subtle">None</span>;
  const byDoc = new Map<string, Sec[]>();
  for (const s of items) byDoc.set(s.doc, [...(byDoc.get(s.doc) ?? []), s]);
  return (
    <div className="space-y-2">
      {[...byDoc].map(([doc, list]) => (
        <div key={doc}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">{doc || "Other"}</div>
          <div className="flex flex-wrap gap-1">
            {list.map((s) => (
              <span key={s.identifier + s.title} title={s.title ? `${s.identifier}: ${s.title}` : s.identifier}
                className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", tone === "removed" ? "border-danger/30 bg-danger-soft/50 text-fg-2 line-through decoration-danger/40" : "border-info/30 bg-info-soft/60 text-fg")}>
                {s.identifier}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Only the controls with a changed test procedure. Selecting one shows those procedures with what moved in their mapping. */
function AffectedControls({ d, selected, set }: { d: Detail; selected: string; set: (p: Record<string, string>) => void }) {
  const open = d.controls.find((c) => c.controlName === selected) ?? d.controls[0] ?? null;
  if (!d.controls.length)
    return <Card><EmptyState icon={ListChecks} title="No client controls are affected" description="No client test procedure maps to different sections in this version." /></Card>;
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="self-start">
        <CardHeader title={`Affected controls (${d.controls.length} of ${d.totalControls})`} description="Select a control to see what changed" />
        <ul className="max-h-[640px] divide-y divide-border overflow-auto">
          {d.controls.map((c) => (
            <li key={c.controlName}>
              <button onClick={() => set({ control: c.controlName })} className={cn("flex w-full items-start gap-2 px-4 py-2.5 text-left text-xs hover:bg-surface-2", open?.controlName === c.controlName && "bg-accent-soft/50")}>
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-medium text-fg">{c.controlName}</div>
                  {c.title && <div className="line-clamp-2 text-muted">{c.title}</div>}
                </div>
                <Badge tone="warning">{c.changed.length} of {c.totalTestProcedures}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {open && (
        <Card>
          <CardHeader
            title={<span className="font-mono">{open.controlName}</span>}
            description={open.title ?? undefined}
            actions={<Button asChild size="sm" variant="ghost"><Link href={`/controls/${encodeURIComponent(open.controlName)}`}>Open control <ArrowRight /></Link></Button>}
          />
          <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">
            {open.changed.length} of {open.totalTestProcedures} test procedure{open.totalTestProcedures === 1 ? "" : "s"} map to different sections in {d.family} {d.current}. The rest map to the same sections in both versions.
          </div>
          <div className="divide-y divide-border">
            {open.changed.map((tp) => (
              <div key={tp.id} className="p-4">
                <div className="mb-2 flex items-start gap-2">
                  <Mono className="whitespace-nowrap text-xs font-medium text-fg">{tp.id}</Mono>
                  <p className="line-clamp-3 text-xs text-muted" title={tp.text}>{tp.text}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Previous mapping · removed ({tp.removed.length})</div>
                    <Sections items={tp.removed} tone="removed" />
                  </div>
                  <div className="rounded border border-accent/30 bg-accent-soft/30 p-3 text-xs">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Updated mapping · added ({tp.added.length})</div>
                    <Sections items={tp.added} tone="added" />
                  </div>
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

/** Every changed test procedure with its control. */
function ChangedProcedures({ d, set }: { d: Detail; set: (p: Record<string, string>) => void }) {
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
                <td className="px-4 py-2 text-right tabular text-info">{tp.added.length}</td>
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
        <CardHeader title="Client impact" description="All client controls" />
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
