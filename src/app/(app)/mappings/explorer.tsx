"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid3x3, Network, Share2, TableProperties, Upload } from "lucide-react";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/common";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import type { FrameworkConnection } from "@/lib/queries/framework-matrix";
import { TERMS } from "@/lib/terms";
import { cn, formatNumber } from "@/lib/utils";
import { CcmCrosswalkView } from "./ccm-crosswalk";
import { RelationshipGraph } from "./relationship-graph";

interface Doc { id: string; short: string; type: string | null; sourceId?: string; versionStatus?: string }
interface Pair { a: Doc; b: Doc; links: number }
type Section = FrameworkConnection["sections"][number]["a"];

const COLOR = { a: "var(--chart-1)", b: "var(--chart-2)" };
const PAGE = 100;

function heat(n: number, max: number): React.CSSProperties {
  const pct = Math.round(18 + (n / max) * 72);
  return { background: `color-mix(in oklab, var(--chart-1) ${pct}%, var(--surface))`, color: pct > 55 ? "#fff" : "var(--fg)" };
}

/**
 * Framework traceability, from supplied relationship files only (nothing is inferred).
 *   Relationship Matrix every framework against every other: the number of mapped relationships in each cell.
 *   Relationship Graph  any two frameworks: baseline and target, the graph, and the mapped controls side by side.
 *   CCM Cross-Mapping   one row per CSA CCM control with the controls it maps to in every other framework.
 * Kept separate from client control traceability (control → test procedures → obligations), on the control pages.
 */
export function MappingExplorer() {
  // The Relationship Graph is the first and default view; the full matrix is the second.
  const [s, set] = useUrlState({ a: "", b: "", view: "graph" });
  const view = s.view === "overview" || s.view === "ccm" ? s.view : "graph";

  const docs = useQuery({ queryKey: ["frameworks", "", "", "", ""], queryFn: () => apiGet<{ items: Doc[] }>("/api/frameworks") });
  const pairs = useQuery({ queryKey: ["fm-pairs", "supplied"], queryFn: () => apiGet<Pair[]>(`/api/framework-matrix${qs({ basis: "supplied" })}`) });

  // Recorded (not loaded) earlier versions have no requirements, so they cannot be related.
  const all = useMemo(() => (docs.data?.items ?? []).filter((d) => d.versionStatus !== "RECORDED").sort((x, y) => x.short.localeCompare(y.short, undefined, { numeric: true })), [docs.data]);
  // Two sources can share a short name (e.g. a consolidated edition); add the source ID to tell them apart.
  const label = (d: Doc) => (all.filter((x) => x.short === d.short).length > 1 ? `${d.short} (${d.sourceId})` : d.short);
  const counts = useMemo(() => new Map((pairs.data ?? []).flatMap((p) => [[`${p.a.id}|${p.b.id}`, p.links], [`${p.b.id}|${p.a.id}`, p.links]] as [string, number][])), [pairs.data]);
  const count = (x: string, y: string) => counts.get(`${x}|${y}`) ?? 0;

  const open = (a: string, b: string) => set({ view: "graph", a, b });
  const loading = docs.isLoading || pairs.isLoading;
  const error = docs.error ?? pairs.error;

  return (
    <Page>
      <PageHeader title={TERMS.frameworkMapping} description="How the frameworks relate: requirement-to-requirement relationships stated in the supplied relationship files. Nothing is inferred." />
      <Tabs value={view} onValueChange={(v) => set({ view: v })}>
        <TabsList className="mb-4">
          <TabsTrigger value="graph"><Share2 /> Relationship Graph</TabsTrigger>
          <TabsTrigger value="overview"><Grid3x3 /> Relationship Matrix</TabsTrigger>
          <TabsTrigger value="ccm"><TableProperties /> CCM Cross-Mapping</TabsTrigger>
        </TabsList>

        {/* Reads its own data (the CCM rows), so it does not wait for the framework pairs. */}
        <TabsContent value="ccm"><CcmCrosswalkView /></TabsContent>
        {view === "ccm" ? null : loading ? <Skeleton className="h-[420px]" /> : error ? (
          <Card><ErrorState error={error} onRetry={() => { docs.refetch(); pairs.refetch(); }} /></Card>
        ) : !pairs.data?.length ? (
          <Card>
            <EmptyState
              icon={Network}
              title="No relationship files imported yet"
              description="Import a relationship file, or a workbook with a cross-framework sheet, under Data & Imports. Framework relationships appear here as soon as it is loaded."
              action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>}
            />
          </Card>
        ) : (
          <>
            <TabsContent value="overview"><Matrix docs={all} label={label} count={count} onOpen={open} /></TabsContent>
            <TabsContent value="graph">
              <RelationGraph docs={all} label={label} count={count} pairs={pairs.data} a={s.a} b={s.b} onChange={(a, b) => set({ a, b })} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </Page>
  );
}

/** Every framework against every other. A cell is the number of mapped relationships; select one to inspect them. */
function Matrix({ docs, label, count, onOpen }: { docs: Doc[]; label: (d: Doc) => string; count: (x: string, y: string) => number; onOpen: (a: string, b: string) => void }) {
  const [hot, setHot] = useState<{ r: string; c: string } | null>(null);
  const max = Math.max(1, ...docs.flatMap((r) => docs.map((c) => (r.id === c.id ? 0 : count(r.id, c.id)))));
  /** Tint the hovered cell's whole row and column so its two frameworks can be followed across the grid. */
  const line = (r: string, c: string) => (hot && (hot.r === r || hot.c === c) ? "bg-accent-soft" : "");
  return (
    <Card>
      <div className="border-b border-border px-4 py-2 text-xs text-accent">Click any number to inspect the relationships between those two frameworks</div>
      <div className="max-h-[calc(100vh-13rem)] overflow-auto" onMouseLeave={() => setHot(null)}>
        <table className="border-separate border-spacing-0 text-[11px]" aria-label="Framework relationship matrix">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-surface" />
              {docs.map((c) => (
                <th key={c.id} className={cn("sticky top-0 z-20 h-32 min-w-7 px-px pb-2 align-bottom", hot?.c === c.id ? "bg-accent-soft" : "bg-surface")}>
                  <div className={cn("mx-auto w-4 rotate-180 whitespace-nowrap font-medium [writing-mode:vertical-rl]", hot?.c === c.id ? "text-fg" : "text-muted")}>{label(c)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.map((r) => (
              <tr key={r.id}>
                <th className={cn("sticky left-0 z-10 whitespace-nowrap pl-3 pr-2 text-right font-medium", hot?.r === r.id ? "bg-accent-soft text-fg" : "bg-surface text-fg-2")}>{label(r)}</th>
                {docs.map((c) => {
                  if (r.id === c.id) return <td key={c.id} className={cn("p-px", line(r.id, c.id))} onMouseEnter={() => setHot({ r: r.id, c: c.id })}><div className="grid h-6 min-w-7 place-items-center rounded bg-surface-3 text-subtle" aria-hidden>—</div></td>;
                  const n = count(r.id, c.id);
                  return (
                    <td key={c.id} className={cn("p-px", line(r.id, c.id))}>
                      {n > 0 ? (
                        <button
                          onClick={() => onOpen(r.id, c.id)}
                          onMouseEnter={() => setHot({ r: r.id, c: c.id })}
                          title={`${label(r)} ↔ ${label(c)}: ${formatNumber(n)} mapped relationships. Select to inspect.`}
                          aria-label={`${label(r)} and ${label(c)}: ${n} mapped relationships`}
                          style={heat(n, max)}
                          className={cn("grid h-6 min-w-7 place-items-center rounded text-[10.5px] font-semibold tabular hover:ring-2 hover:ring-accent", hot && (hot.r === r.id || hot.c === c.id) && "ring-1 ring-accent/60")}
                        >{n}</button>
                      ) : (
                        <div onMouseEnter={() => setHot({ r: r.id, c: c.id })} title={`${label(r)} ↔ ${label(c)}: no supplied mapping`} className="grid h-6 min-w-7 place-items-center rounded text-subtle tabular">0</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Any two frameworks: the relationship graph, then the mapped controls side by side. */
function RelationGraph({ docs, label, count, pairs, a, b, onChange }: {
  docs: Doc[]; label: (d: Doc) => string; count: (x: string, y: string) => number; pairs: Pair[]; a: string; b: string; onChange: (a: string, b: string) => void;
}) {
  // Until a pair is chosen, show the one with the most mapped relationships.
  const strongest = useMemo(() => [...pairs].sort((x, y) => y.links - x.links)[0], [pairs]);
  const baseline = a || strongest.a.id;
  const target = a || b ? b : strongest.b.id;

  const conn = useQuery({
    queryKey: ["fm-connection", baseline, target, "supplied"],
    queryFn: () => apiGet<FrameworkConnection>(`/api/framework-matrix${qs({ view: "connection", a: baseline, b: target, basis: "supplied" })}`),
    enabled: !!baseline && !!target && baseline !== target,
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Baseline Framework</span>
          <Select
            value={baseline} onChange={(v) => onChange(v, target === v ? "" : target)} placeholder="Select a baseline framework"
            options={docs.map((d) => ({ value: d.id, label: label(d) }))} triggerClassName="min-w-[260px]" aria-label="Baseline Framework"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Target Framework</span>
          <Select
            value={target} onChange={(v) => onChange(baseline, v)} placeholder="Select a target framework"
            options={docs.filter((d) => d.id !== baseline).map((d) => ({ value: d.id, label: label(d), hint: count(baseline, d.id) ? `${formatNumber(count(baseline, d.id))} mapped` : undefined }))}
            triggerClassName="min-w-[260px]" aria-label="Target Framework"
          />
        </label>
      </Card>

      {!baseline || !target ? (
        <Card><EmptyState icon={Share2} title="Select a target framework" description="Choose the framework to compare with the baseline. Frameworks with mapped relationships show their count." /></Card>
      ) : conn.isLoading ? <Skeleton className="h-[420px]" /> : conn.error ? (
        <Card><ErrorState error={conn.error} onRetry={conn.refetch} /></Card>
      ) : !conn.data || !conn.data.a || !conn.data.b ? null : !conn.data.links ? (
        <Card><EmptyState icon={Network} title={`No mapped relationships between ${conn.data.a.short} and ${conn.data.b.short}`} description="No supplied relationship file links these two frameworks." /></Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Relationship graph" description={`${conn.data.a.short} and ${conn.data.b.short}: ${formatNumber(conn.data.links)} mapped relationships. Each line joins two requirements.`} icon={<Share2 />} />
            <div className="p-4"><RelationshipGraph data={conn.data} colors={COLOR} /></div>
          </Card>
          <MappingTable key={`${baseline}|${target}`} data={conn.data} />
        </>
      )}
    </div>
  );
}

/** The mapped controls of the selected pair, side by side. */
function MappingTable({ data }: { data: FrameworkConnection }) {
  const [limit, setLimit] = useState(PAGE);
  const rows = data.sections;
  return (
    <Card>
      <CardHeader title="Mapping table" description={`${formatNumber(data.links)} mapped relationship${data.links === 1 ? "" : "s"}${rows.length < data.links ? `, first ${formatNumber(rows.length)} shown` : ""}`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-left text-xs">
          <thead className="bg-surface-2">
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="w-1/2 px-4 py-2"><span style={{ color: COLOR.a }}>■</span> Baseline Framework Control<div className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-subtle">{data.a?.short}</div></th>
              <th className="w-1/2 px-4 py-2"><span style={{ color: COLOR.b }}>■</span> Mapped Framework Control<div className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-subtle">{data.b?.short}</div></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((p) => (
              <tr key={`${p.a.id}|${p.b.id}`} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-2.5"><ControlCell s={p.a} /></td>
                <td className="px-4 py-2.5"><ControlCell s={p.b} /></td>
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

/** A control by its publisher identifier, title and description; the library's internal IDs are not shown. */
function ControlCell({ s }: { s: Section }) {
  return (
    <>
      <Link href={`/citations?citation=${s.sourceSectionId}`} className="font-mono font-medium text-fg hover:text-accent">{s.identifier}</Link>
      {s.title && <span className="ml-2 font-medium text-fg-2">{s.title}</span>}
      {s.description && <p className="mt-0.5 line-clamp-3 text-muted">{s.description}</p>}
    </>
  );
}
