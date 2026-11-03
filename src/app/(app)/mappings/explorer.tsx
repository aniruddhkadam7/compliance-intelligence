"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Grid3x3, Info, Network, Upload, Workflow } from "lucide-react";
import { EmptyState, ErrorState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, qs } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import type { FrameworkConnection } from "@/lib/queries/framework-matrix";
import { TERMS } from "@/lib/terms";
import { cn, formatNumber } from "@/lib/utils";
import { ConnectionDiagram } from "./connection-diagram";

interface Doc { id: string; short: string; type: string | null }
interface Pair { a: Doc; b: Doc; links: number; bridges: number }
interface Coverage { controls: number; frameworks: (Doc & { controls: number; sections: number })[] }

const COLOR = { a: "var(--chart-1)", b: "var(--chart-2)", team: "var(--chart-4)" };
const BASIS = {
  controls: { label: "Internal control mappings", hint: "Sections are related when the same internal control maps to both. Controls are not shown." },
  supplied: { label: "Supplied relationship files", hint: "Section-to-section relationships imported as a relationship file." },
} as const;
const LEVELS = { domain: "Domain", segment: "Segment", team: "Team" } as const;
type Basis = keyof typeof BASIS;
type Level = keyof typeof LEVELS;

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

/** Framework-to-framework relationships. The underlying controls are used for matching only and never displayed. */
export function MappingExplorer() {
  const [s, set] = useUrlState({ a: "", b: "", basis: "controls", level: "domain" });
  const basis = (s.basis in BASIS ? s.basis : "controls") as Basis;
  const level = (s.level in LEVELS ? s.level : "domain") as Level;

  const docs = useQuery({ queryKey: ["frameworks", "", "", "", ""], queryFn: () => apiGet<{ items: Doc[] }>("/api/frameworks") });
  const pairs = useQuery({ queryKey: ["fm-pairs", basis], queryFn: () => apiGet<Pair[]>(`/api/framework-matrix${qs({ basis })}`) });
  const coverage = useQuery({ queryKey: ["fm-coverage"], queryFn: () => apiGet<Coverage>("/api/framework-matrix?view=coverage") });
  const conn = useQuery({
    queryKey: ["fm-connection", s.a, s.b, basis],
    queryFn: () => apiGet<FrameworkConnection>(`/api/framework-matrix${qs({ view: "connection", a: s.a, b: s.b, basis })}`),
    enabled: !!s.a && !!s.b && s.a !== s.b,
  });

  const all = useMemo(() => [...(docs.data?.items ?? [])].sort((x, y) => x.short.localeCompare(y.short, undefined, { numeric: true })), [docs.data]);
  const linked = useMemo(() => {
    const ids = new Map<string, Doc>();
    for (const p of pairs.data ?? []) { ids.set(p.a.id, p.a); ids.set(p.b.id, p.b); }
    return [...ids.values()].sort((x, y) => x.short.localeCompare(y.short, undefined, { numeric: true }));
  }, [pairs.data]);
  const cell = (x: string, y: string) => (pairs.data ?? []).find((p) => (p.a.id === x && p.b.id === y) || (p.a.id === y && p.b.id === x));
  const maxLinks = Math.max(1, ...(pairs.data ?? []).map((p) => p.links));
  const noControls = basis === "controls" && coverage.data && coverage.data.controls === 0;

  return (
    <Page>
      <PageHeader
        title={TERMS.frameworkMapping}
        description="Select any two frameworks to see how they relate, by domain, segment or owning team. Relationships come only from actual mapping data; the underlying matching layer is not shown."
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <Select value={s.a} onChange={(v) => set({ a: v })} placeholder="Framework A" options={all.map((d) => ({ value: d.id, label: d.short }))} triggerClassName="min-w-[210px]" aria-label="Framework A" />
        <Button size="sm" variant="ghost" onClick={() => set({ a: s.b, b: s.a })} aria-label="Swap frameworks" disabled={!s.a && !s.b}><ArrowLeftRight /></Button>
        <Select value={s.b} onChange={(v) => set({ b: v })} placeholder="Framework B" options={all.filter((d) => d.id !== s.a).map((d) => ({ value: d.id, label: d.short, hint: s.a && cell(s.a, d.id) ? `${cell(s.a, d.id)!.links} links` : undefined }))} triggerClassName="min-w-[210px]" aria-label="Framework B" />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <Segmented label="Relationship basis" value={basis} onChange={(v) => set({ basis: v })} options={{ controls: BASIS.controls.label, supplied: BASIS.supplied.label }} />
        <Segmented label="Level" value={level} onChange={(v) => set({ level: v })} options={LEVELS} />
      </Card>

      <p className="-mt-2 mb-4 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />{BASIS[basis].hint}</p>

      {(pairs.isLoading || coverage.isLoading) && <Skeleton className="h-[280px]" />}
      {!!pairs.error && <Card><ErrorState error={pairs.error} onRetry={pairs.refetch} /></Card>}

      {noControls ? (
        <Card>
          <EmptyState
            icon={Network}
            title="No internal control mappings uploaded yet"
            description="Framework relationships on this basis come from the control mapping workbook. Upload it under Data & Imports; framework-level relationships appear here without showing the controls."
            action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {basis === "controls" && coverage.data && coverage.data.frameworks.length < 2 && (
            <Card>
              <CardBody className="flex items-start gap-3">
                <Info className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="text-[13px]">
                  <div className="font-semibold text-fg">The current mapping data links one framework only</div>
                  <p className="mt-1 text-muted">
                    {coverage.data.frameworks.length
                      ? <>The uploaded control mappings point to sections of <b className="text-fg-2">{coverage.data.frameworks.map((f) => f.short).join(", ")}</b> ({formatNumber(coverage.data.frameworks[0].sections)} sections) and no other framework, so no framework-to-framework relationship can be derived yet.</>
                      : <>The uploaded controls do not map to any section of the document library yet.</>}
                    {" "}Relationships appear as soon as the control mapping includes Source IDs from a second framework (for example NIST CSF 2.0 or CIS Controls). No relationships are inferred in the meantime.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {linked.length > 0 && (
            <Card>
              <CardHeader title="Framework matrix" description="Linked section pairs between each pair of frameworks. Select a cell to open the connection." icon={<Grid3x3 />} />
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
                                <button onClick={() => set({ a: r.id, b: c.id })} title={`${r.short} ↔ ${c.short}: ${p.links} mapped relationships`} style={heat(p.links, maxLinks)} className={cn("grid size-10 place-items-center rounded font-semibold tabular hover:ring-2 hover:ring-accent", on && "ring-2 ring-fg")}>{p.links}</button>
                              ) : <button onClick={() => set({ a: r.id, b: c.id })} title={`${r.short} ↔ ${c.short}: no mapped relationships; select to see unmatched sections`} className={cn("grid size-10 place-items-center rounded border border-dashed border-border text-subtle hover:ring-2 hover:ring-accent", on && "ring-2 ring-fg")}>0</button>}
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
            <Connection data={conn.data} loading={conn.isLoading} error={conn.error} retry={conn.refetch} level={level} basis={basis} />
          ) : (
            <Card><EmptyState icon={Workflow} title="Select two frameworks" description="Choose Framework A and Framework B above, or select a cell in the matrix." /></Card>
          )}
        </div>
      )}
    </Page>
  );
}

function Connection({ data, loading, error, retry, level, basis }: { data?: FrameworkConnection; loading: boolean; error: unknown; retry: () => void; level: Level; basis: Basis }) {
  if (loading) return <Skeleton className="h-[360px]" />;
  if (error) return <Card><ErrorState error={error} onRetry={retry} /></Card>;
  if (!data || !data.a || !data.b) return null;
  if (!data.links)
    return (
      <div className="space-y-4">
      <Card>
        <EmptyState icon={Network} title={`No relationships between ${data.a.short} and ${data.b.short}`} description={basis === "controls" ? "No internal control maps to sections of both frameworks in the current data." : "No supplied relationship links these two frameworks."} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Unmatched fw={data.a.short} color={COLOR.a} data={data.unmatched.a} />
        <Unmatched fw={data.b.short} color={COLOR.b} data={data.unmatched.b} />
      </div>
      </div>
    );

  const A = { title: data.a.short, color: COLOR.a }, B = { title: data.b.short, color: COLOR.b };
  const teamLevel = level === "team" && basis === "controls";
  const view = level === "segment" ? data.segment : data.domain;

  return (
    <div className="space-y-4">
      <StatStrip
        className={basis === "controls" ? "xl:grid-cols-4" : "xl:grid-cols-3"}
        items={[
          { label: `${data.a.short} sections linked`, value: data.domain.left.reduce((n, x) => n + x.count, 0) },
          { label: `${data.b.short} sections linked`, value: data.domain.right.reduce((n, x) => n + x.count, 0) },
          { label: "Linked section pairs", value: data.links },
          ...(basis === "controls" ? [{ label: "Internal controls used for matching", value: data.bridges, hint: "Count only; the controls are not shown" }] : []),
        ]}
      />
      <Card>
        <CardHeader
          title={`${LEVELS[level]} view`}
          description={teamLevel ? "Domains of each framework, connected through the owning teams of the matching controls" : `${LEVELS[level]}s of ${data.a.short} (left) and ${data.b.short} (right). Hover a node to trace its connections.`}
          icon={<Workflow />}
        />
        <div className="overflow-x-auto p-4">
          {level === "team" && basis !== "controls" ? (
            <p className="py-6 text-center text-xs text-muted">The team level is available for internal control mappings only; supplied relationship files carry no team information.</p>
          ) : teamLevel ? (
            <ConnectionDiagram
              unit="section pairs"
              columns={[{ ...A, nodes: data.team.left }, { title: "Owning team", color: COLOR.team, nodes: data.team.middle }, { ...B, nodes: data.team.right }]}
              edgeSets={[data.team.edgesIn, data.team.edgesOut]}
            />
          ) : (
            <ConnectionDiagram unit="section pairs" columns={[{ ...A, nodes: view.left }, { ...B, nodes: view.right }]} edgeSets={[view.edges]} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Linked sections" description={`${formatNumber(data.links)} section pair(s)${data.sections.length < data.links ? `, first ${data.sections.length} shown` : ""}`} />
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-2"><span style={{ color: COLOR.a }}>■</span> {data.a.short}</th>
                <th className="px-4 py-2"><span style={{ color: COLOR.b }}>■</span> {data.b.short}</th>
                {basis === "controls" && <th className="px-4 py-2">Basis</th>}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((p) => (
                <tr key={`${p.a.id}|${p.b.id}`} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2"><Link href={`/citations?citation=${p.a.sourceSectionId}`} className="font-mono font-medium text-fg hover:text-accent">{p.a.sourceSectionId}</Link><div className="text-fg-2">{p.a.sectionName}</div>{p.a.description && <div className="line-clamp-3 text-muted">{p.a.description}</div>}</td>
                  <td className="px-4 py-2"><Link href={`/citations?citation=${p.b.sourceSectionId}`} className="font-mono font-medium text-fg hover:text-accent">{p.b.sourceSectionId}</Link><div className="text-fg-2">{p.b.sectionName}</div>{p.b.description && <div className="line-clamp-3 text-muted">{p.b.description}</div>}</td>
                  {basis === "controls" && (
                    <td className="whitespace-nowrap px-4 py-2 text-muted">
                      {p.via} internal control{p.via === 1 ? "" : "s"}
                      {p.teams.length > 0 && <div className="mt-0.5 flex gap-1">{p.teams.map((t) => <Badge key={t} tone="outline">{t}</Badge>)}</div>}
                    </td>
                  )}
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
      <p className="text-[11px] text-subtle">
        {basis === "controls"
          ? <>Derived from the uploaded control mapping: two sections are linked when at least one internal control maps to both. Section IDs are <Mono className="text-[11px]">Source IDs</Mono> from the global library.</>
          : <>From supplied relationship files only.</>}
      </p>
    </div>
  );
}

function Unmatched({ fw, color, data }: { fw: string; color: string; data: FrameworkConnection["unmatched"]["a"] }) {
  return (
    <Card>
      <CardHeader title={<><span style={{ color }}>■</span> {fw}: unmatched sections</>} description={`${formatNumber(data.count)} of ${formatNumber(data.total)} sections have no mapped relationship to the other framework${data.items.length < data.count ? `, first ${data.items.length} shown` : ""}`} />
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-left text-xs">
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-2"><Link href={`/citations?citation=${c.sourceSectionId}`} className="font-mono font-medium text-fg hover:text-accent">{c.sourceSectionId}</Link><div className="text-fg-2">{c.sectionName}</div>{c.description && <div className="line-clamp-2 text-muted">{c.description}</div>}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td className="px-4 py-3 text-muted">Every section is mapped.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
