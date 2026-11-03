"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Grid3x3, Info, Network, Share2, Upload, Workflow } from "lucide-react";
import { EmptyState, ErrorState, Page, PageHeader, StatStrip } from "@/components/common";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import type { FrameworkConnection } from "@/lib/queries/framework-matrix";
import { TERMS } from "@/lib/terms";
import { cn, formatNumber } from "@/lib/utils";
import { ConnectionDiagram } from "./connection-diagram";
import { RelationshipGraph } from "./relationship-graph";

interface Doc { id: string; short: string; type: string | null; sourceId?: string; versionStatus?: string }
interface Pair { a: Doc; b: Doc; links: number; bridges: number }
type Section = FrameworkConnection["sections"][number]["a"];

const COLOR = { a: "var(--chart-1)", b: "var(--chart-2)" };
const BASIS = {
  supplied: { label: "Supplied relationship files", hint: "Requirement-to-requirement relationships stated in imported relationship files, such as a publisher's own crosswalk. Nothing is inferred." },
  controls: { label: "Internal control mapping", hint: "Not in use yet. Framework relationships currently come from supplied relationship files only." },
} as const;
const LEVELS = { domain: "Domain", segment: "Segment" } as const;
const VIEWS = { overview: "Overview", graph: "Relationship graph" } as const;
type Basis = keyof typeof BASIS;
type Level = keyof typeof LEVELS;
type View = keyof typeof VIEWS;

function heat(n: number, max: number): React.CSSProperties {
  const pct = Math.round(18 + (n / max) * 72);
  return { background: `color-mix(in oklab, var(--chart-1) ${pct}%, var(--surface))`, color: pct > 55 ? "#fff" : "var(--fg)" };
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Record<T, string>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border p-0.5">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={cn("rounded px-2.5 py-1 text-xs", value === k ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg")}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

/**
 * Framework traceability: how two frameworks are interconnected, from supplied relationship files. Kept separate
 * from client control traceability (control → test procedures → obligations), which lives on the control pages.
 */
export function MappingExplorer() {
  const [s, set] = useUrlState({ a: "", b: "", basis: "supplied", level: "domain", view: "overview" });
  const basis = (s.basis in BASIS ? s.basis : "supplied") as Basis;
  const level = (s.level in LEVELS ? s.level : "domain") as Level;
  const view = (s.view in VIEWS ? s.view : "overview") as View;
  const supplied = basis === "supplied";

  const docs = useQuery({ queryKey: ["frameworks", "", "", "", ""], queryFn: () => apiGet<{ items: Doc[] }>("/api/frameworks") });
  const pairs = useQuery({ queryKey: ["fm-pairs", basis], queryFn: () => apiGet<Pair[]>(`/api/framework-matrix${qs({ basis })}`), enabled: supplied });
  const conn = useQuery({
    queryKey: ["fm-connection", s.a, s.b, basis],
    queryFn: () => apiGet<FrameworkConnection>(`/api/framework-matrix${qs({ view: "connection", a: s.a, b: s.b, basis })}`),
    enabled: supplied && !!s.a && !!s.b && s.a !== s.b,
  });

  // Recorded (not loaded) earlier versions have no requirements, so they cannot be compared.
  const all = useMemo(() => (docs.data?.items ?? []).filter((d) => d.versionStatus !== "RECORDED").sort((x, y) => x.short.localeCompare(y.short, undefined, { numeric: true })), [docs.data]);
  // Two sources can share a short name (e.g. a consolidated edition); add the source ID to tell them apart.
  const optLabel = (d: Doc) => (all.filter((x) => x.short === d.short).length > 1 ? `${d.short} (${d.sourceId})` : d.short);
  const linked = useMemo(() => {
    const ids = new Map<string, Doc>();
    for (const p of pairs.data ?? []) { ids.set(p.a.id, p.a); ids.set(p.b.id, p.b); }
    return [...ids.values()].sort((x, y) => x.short.localeCompare(y.short, undefined, { numeric: true }));
  }, [pairs.data]);
  const cell = (x: string, y: string) => (pairs.data ?? []).find((p) => (p.a.id === x && p.b.id === y) || (p.a.id === y && p.b.id === x));
  const maxLinks = Math.max(1, ...(pairs.data ?? []).map((p) => p.links));

  return (
    <Page>
      <PageHeader
        title={TERMS.frameworkMapping}
        description="Framework traceability: select any two frameworks to see how they are interconnected and which requirements link them. Relationships come only from supplied relationship files."
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <Select value={s.a} onChange={(v) => set({ a: v })} placeholder="Framework A" options={all.map((d) => ({ value: d.id, label: optLabel(d) }))} triggerClassName="min-w-[210px]" aria-label="Framework A" />
        <Button size="sm" variant="ghost" onClick={() => set({ a: s.b, b: s.a })} aria-label="Swap frameworks" disabled={!s.a && !s.b}><ArrowLeftRight /></Button>
        <Select value={s.b} onChange={(v) => set({ b: v })} placeholder="Framework B" options={all.filter((d) => d.id !== s.a).map((d) => ({ value: d.id, label: optLabel(d), hint: s.a && cell(s.a, d.id) ? `${cell(s.a, d.id)!.links} links` : undefined }))} triggerClassName="min-w-[210px]" aria-label="Framework B" />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <Segmented label="Relationship basis" value={basis} onChange={(v) => set({ basis: v })} options={{ supplied: BASIS.supplied.label, controls: BASIS.controls.label }} />
        {supplied && <>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <Segmented label="View" value={view} onChange={(v) => set({ view: v })} options={VIEWS} />
          {view === "overview" && <Segmented label="Level" value={level} onChange={(v) => set({ level: v })} options={LEVELS} />}
        </>}
      </Card>

      <p className="-mt-2 mb-4 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />{BASIS[basis].hint}</p>

      {!supplied ? (
        <Card>
          <EmptyState
            icon={Network}
            title="Internal control mapping is not in use yet"
            description="This option is kept for later. Framework relationships currently come from supplied relationship files only; client control traceability stays on the control pages."
            action={<Button variant="primary" onClick={() => set({ basis: "supplied" })}>Show supplied relationships</Button>}
          />
        </Card>
      ) : pairs.isLoading ? <Skeleton className="h-[280px]" /> : pairs.error ? (
        <Card><ErrorState error={pairs.error} onRetry={pairs.refetch} /></Card>
      ) : !linked.length ? (
        <Card>
          <EmptyState
            icon={Network}
            title="No relationship files imported yet"
            description="Import a relationship file (Source ID A | Source ID B | Relationship | Notes) under Data & Imports, for example a publisher crosswalk. Framework relationships appear here as soon as it is loaded."
            action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {view === "overview" && (
            <Card>
              <CardHeader title="Framework matrix" description="Related requirement pairs between each pair of frameworks. Select a cell to open the connection." icon={<Grid3x3 />} />
              <div className="overflow-auto p-4">
                <table className="border-separate border-spacing-1 text-xs">
                  <thead>
                    <tr>
                      <th />
                      {linked.map((c) => <th key={c.id} className="h-28 w-10 align-bottom font-medium text-muted"><div className="mx-auto w-4 rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{c.short}</div></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {linked.map((r) => (
                      <tr key={r.id}>
                        <th className="whitespace-nowrap pr-2 text-right font-medium text-fg-2">{r.short}</th>
                        {linked.map((c) => {
                          const p = r.id === c.id ? null : cell(r.id, c.id);
                          const on = (s.a === r.id && s.b === c.id) || (s.a === c.id && s.b === r.id);
                          return (
                            <td key={c.id} className="p-0">
                              {r.id === c.id ? <div className="size-10 rounded bg-surface-3" aria-hidden /> : p ? (
                                <button onClick={() => set({ a: r.id, b: c.id })} title={`${r.short} ↔ ${c.short}: ${p.links} related requirement pairs`} style={heat(p.links, maxLinks)} className={cn("grid size-10 place-items-center rounded font-semibold tabular hover:ring-2 hover:ring-accent", on && "ring-2 ring-fg")}>{p.links}</button>
                              ) : <button onClick={() => set({ a: r.id, b: c.id })} title={`${r.short} ↔ ${c.short}: no supplied relationships`} className={cn("grid size-10 place-items-center rounded border border-dashed border-border text-subtle hover:ring-2 hover:ring-accent", on && "ring-2 ring-fg")}>0</button>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {s.a && s.b && s.a !== s.b ? (
            <Connection data={conn.data} loading={conn.isLoading} error={conn.error} retry={conn.refetch} level={level} view={view} />
          ) : (
            <Card>
              <EmptyState
                icon={view === "graph" ? Share2 : Workflow}
                title="Select two frameworks"
                description={`Choose Framework A and Framework B above${view === "overview" ? ", or select a cell in the matrix" : ""}. Frameworks with supplied relationships: ${linked.map((d) => d.short).join(", ")}.`}
              />
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

function Connection({ data, loading, error, retry, level, view }: { data?: FrameworkConnection; loading: boolean; error: unknown; retry: () => void; level: Level; view: View }) {
  if (loading) return <Skeleton className="h-[360px]" />;
  if (error) return <Card><ErrorState error={error} onRetry={retry} /></Card>;
  if (!data || !data.a || !data.b) return null;
  if (!data.links)
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState icon={Network} title={`No relationships between ${data.a.short} and ${data.b.short}`} description="No supplied relationship file links these two frameworks." />
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Unmatched fw={data.a.short} color={COLOR.a} data={data.unmatched.a} />
          <Unmatched fw={data.b.short} color={COLOR.b} data={data.unmatched.b} />
        </div>
      </div>
    );

  const A = { title: data.a.short, color: COLOR.a }, B = { title: data.b.short, color: COLOR.b };
  const diagram = level === "segment" ? data.segment : data.domain;
  const types = [...new Set(data.sections.flatMap((p) => p.types))];

  return (
    <div className="space-y-4">
      <StatStrip
        className="xl:grid-cols-4"
        items={[
          { label: `${data.a.short} requirements linked`, value: data.domain.left.reduce((n, x) => n + x.count, 0) },
          { label: `${data.b.short} requirements linked`, value: data.domain.right.reduce((n, x) => n + x.count, 0) },
          { label: "Common links", value: data.links },
          { label: "Relationship type", value: types.length === 1 ? types[0] : types.length, sub: types.length > 1 ? types.join(", ") : "As stated in the relationship file" },
        ]}
      />
      {view === "graph" ? (
        <Card>
          <CardHeader title="Relationship graph" description={`How ${data.a.short} and ${data.b.short} are interconnected: each line is a stated relationship between two requirements.`} icon={<Share2 />} />
          <div className="p-4"><RelationshipGraph data={data} colors={COLOR} /></div>
        </Card>
      ) : (
        <Card>
          <CardHeader title={`${LEVELS[level]} view`} description={`${LEVELS[level]}s of ${data.a.short} (left) and ${data.b.short} (right). Hover a node to trace its connections.`} icon={<Workflow />} />
          <div className="overflow-x-auto p-4">
            <ConnectionDiagram unit="requirement pairs" columns={[{ ...A, nodes: diagram.left }, { ...B, nodes: diagram.right }]} edgeSets={[diagram.edges]} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Common links" description={`${formatNumber(data.links)} related requirement pair(s)${data.sections.length < data.links ? `, first ${data.sections.length} shown` : ""}`} />
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-2"><span style={{ color: COLOR.a }}>■</span> {data.a.short}</th>
                <th className="px-4 py-2"><span style={{ color: COLOR.b }}>■</span> {data.b.short}</th>
                <th className="px-4 py-2">Relationship</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((p) => (
                <tr key={`${p.a.id}|${p.b.id}`} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2"><SectionCell s={p.a} /></td>
                  <td className="px-4 py-2"><SectionCell s={p.b} /></td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{p.types.join(", ") || "Related"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Unmatched fw={data.a.short} color={COLOR.a} data={data.unmatched.a} />
        <Unmatched fw={data.b.short} color={COLOR.b} data={data.unmatched.b} />
      </div>
      <p className="text-[11px] text-subtle">From supplied relationship files only. Requirements are shown by their publisher identifiers.</p>
    </div>
  );
}

/** A requirement by its publisher identifier and domain; the library's internal IDs are not shown. */
function SectionCell({ s, lines = 3 }: { s: Section; lines?: 2 | 3 }) {
  return (
    <>
      <Link href={`/citations?citation=${s.sourceSectionId}`} className="font-mono font-medium text-fg hover:text-accent">{s.identifier}</Link>
      <span className="ml-1.5 text-subtle">{s.domain}</span>
      {s.description && <div className={cn("text-muted", lines === 2 ? "line-clamp-2" : "line-clamp-3")}>{s.description}</div>}
    </>
  );
}

function Unmatched({ fw, color, data }: { fw: string; color: string; data: FrameworkConnection["unmatched"]["a"] }) {
  return (
    <Card>
      <CardHeader title={<><span style={{ color }}>■</span> {fw}: unlinked requirements</>} description={`${formatNumber(data.count)} of ${formatNumber(data.total)} requirements have no supplied relationship to the other framework${data.items.length < data.count ? `, first ${data.items.length} shown` : ""}`} />
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-left text-xs">
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-2"><SectionCell s={c} lines={2} /></td>
              </tr>
            ))}
            {!data.items.length && <tr><td className="px-4 py-3 text-muted">Every requirement is linked.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
