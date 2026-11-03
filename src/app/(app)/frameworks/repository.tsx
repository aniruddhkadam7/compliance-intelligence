"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Search, X } from "lucide-react";
import { Page, PageHeader, Mono, StatStrip } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { DataTable, type SortState } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import { formatDate, formatNumber } from "@/lib/utils";
import { TERMS } from "@/lib/terms";

interface FrameworkRow {
  id: string; sourceId: string; name: string; short: string; family: string | null; versionLabel: string | null; type: string | null;
  group: string | null; jurisdiction: string | null; licensing: string | null; documentUrl: string | null; prioritizedByGsk: boolean;
  citations: number; sourceUpdatedAt: string | null; sourceUpdatedBy: string | null; loadedAt: string;
  versionStatus: "CURRENT" | "PREVIOUS" | "RECORDED"; supersededBy: { id: string; version: string | null } | null; note: string | null;
}

const STATUS_ORDER = { CURRENT: 0, PREVIOUS: 1, RECORDED: 2 } as const;
const versionKey = (v: string | null) => (v ?? "").split(/[^\d]+/).filter(Boolean).map(Number);
const cmpVersion = (a: string | null, b: string | null) => {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** Current version, an older version held in the library, or an earlier version known only from the publisher. */
function VersionStatusCell({ f }: { f: FrameworkRow }) {
  if (f.versionStatus === "CURRENT") return <Badge tone="success">Current</Badge>;
  const by = f.supersededBy?.version ? ` by ${f.supersededBy.version}` : "";
  if (f.versionStatus === "PREVIOUS")
    return <Tooltip content="An earlier version kept in the library, with its obligations, for history and version comparison."><span className="whitespace-nowrap"><Badge tone="neutral">Previous</Badge><span className="ml-1.5 text-[11px] text-muted">replaced{by}</span></span></Tooltip>;
  return <Tooltip content={f.note ?? "Earlier version reported by the publisher; its text is not loaded."}><span className="whitespace-nowrap"><Badge tone="outline">Historical</Badge><span className="ml-1.5 text-[11px] text-muted">not loaded</span></span></Tooltip>;
}
interface Facet { value: string; count: number }

export const typeTone = (t: string | null) => (t === "Law or Regulation" ? "warning" : t === "Industry Standard" ? "info" : "neutral");

export function FrameworkRepository() {
  const navigate = useNavigate();
  const [s, set] = useUrlState({ q: "", type: "", jurisdiction: "", group: "", versions: "", sort: "framework", dir: "asc" });
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (dq !== s.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["frameworks", s.q, s.type, s.jurisdiction, s.group],
    queryFn: () => apiGet<{ items: FrameworkRow[]; facets: { types: Facet[]; jurisdictions: Facet[]; groups: Facet[] } }>(
      `/api/frameworks${qs({ q: s.q, type: s.type, jurisdiction: s.jurisdiction, group: s.group })}`,
    ),
    placeholderData: keepPreviousData,
  });

  const all = useMemo(() => data?.items ?? [], [data]);
  // Small set: filtering by version status and sorting are done client-side.
  const rows = useMemo(() => {
    const items = all.filter((r) => !s.versions || (s.versions === "current" ? r.versionStatus === "CURRENT" : r.versionStatus !== "CURRENT"));
    // "framework": versions of one framework together, current first, then older versions newest first.
    const byFramework = (a: FrameworkRow, b: FrameworkRow) =>
      (a.family ?? a.short).localeCompare(b.family ?? b.short) || STATUS_ORDER[a.versionStatus] - STATUS_ORDER[b.versionStatus] || cmpVersion(b.versionLabel, a.versionLabel);
    const k = s.sort as keyof FrameworkRow;
    items.sort((a, b) => {
      if (s.sort === "framework") return s.dir === "desc" ? -byFramework(a, b) : byFramework(a, b);
      const x = a[k] ?? "", y = b[k] ?? "";
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return s.dir === "desc" ? -c : c;
    });
    return items;
  }, [all, s.versions, s.sort, s.dir]);
  const n = (st: FrameworkRow["versionStatus"]) => all.filter((r) => r.versionStatus === st).length;

  const columns = useMemo<ColumnDef<FrameworkRow, unknown>[]>(() => [
    {
      id: "framework", header: "Framework",
      cell: ({ row: { original: f } }) => (
        <div className={f.versionStatus === "CURRENT" ? "min-w-[280px] max-w-[460px]" : "min-w-[280px] max-w-[460px] pl-4"}>
          <div className={f.versionStatus === "CURRENT" ? "font-medium text-fg" : "text-fg-2"}>{f.short}</div>
          <div className="line-clamp-1 text-[11px] text-muted">{f.name}</div>
        </div>
      ),
    },
    { id: "versionLabel", header: "Version", size: 80, cell: ({ row }) => row.original.versionLabel ? <Mono>{row.original.versionLabel}</Mono> : <span className="text-subtle">—</span> },
    { id: "versionStatus", header: "Version status", size: 170, enableSorting: false, cell: ({ row }) => <VersionStatusCell f={row.original} /> },
    { id: "type", header: "Category", size: 150, cell: ({ row }) => <Badge tone={typeTone(row.original.type)}>{row.original.type ?? "—"}</Badge> },
    { id: "group", header: "Group", size: 160, cell: ({ row }) => <span className="whitespace-nowrap text-fg-2">{row.original.group}</span> },
    { id: "jurisdiction", header: "Jurisdiction", size: 90, cell: ({ row }) => <span className="text-fg-2">{row.original.jurisdiction}</span> },
    { id: "citations", header: "Obligations", size: 100, cell: ({ row }) => row.original.versionStatus === "RECORDED" ? <span className="text-xs text-subtle">Not loaded</span> : <span className="tabular">{formatNumber(row.original.citations)}</span> },
    {
      id: "sourceUpdatedAt", header: "Published", size: 120,
      cell: ({ row: { original: f } }) =>
        f.versionStatus === "RECORDED" ? <span className="text-xs text-subtle">—</span> : f.sourceUpdatedAt ? (
          <Tooltip content={`Published update date reported by ${f.sourceUpdatedBy}`}>
            <span className="whitespace-nowrap text-xs text-fg-2">{formatDate(f.sourceUpdatedAt)}</span>
          </Tooltip>
        ) : (
          <Tooltip content="No publication date reported by the official source yet">
            <span className="text-xs text-subtle">Not available</span>
          </Tooltip>
        ),
    },
    {
      id: "loadedAt", header: "Loaded", size: 110,
      cell: ({ row }) => row.original.versionStatus === "RECORDED" ? <span className="text-xs text-subtle">—</span> : (
        <Tooltip content="When this record was last imported into the platform (not a publication date)">
          <span className="whitespace-nowrap text-xs text-muted">{formatDate(row.original.loadedAt)}</span>
        </Tooltip>
      ),
    },
    {
      id: "source", header: "Source", enableSorting: false, size: 60,
      cell: ({ row }) => row.original.documentUrl ? (
        <a href={row.original.documentUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-accent" aria-label="Open source document">
          <ExternalLink className="size-3.5" />
        </a>
      ) : null,
    },
  ], []);

  const facets = data?.facets;
  const active = [s.q, s.type, s.jurisdiction, s.group, s.versions].some(Boolean);

  return (
    <Page>
      <PageHeader
        title={TERMS.frameworks}
        description="The full framework repository: every framework in the library and every version of it, including earlier versions kept for history and comparison and earlier editions known from the publisher. Sources is the operational view of the current versions and their update status."
      />
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "Frameworks", value: n("CURRENT"), sub: "Current versions" },
          { label: "Previous versions held", value: n("PREVIOUS"), sub: "Loaded, kept for history" },
          { label: "Earlier versions recorded", value: n("RECORDED"), sub: "Known from the publisher, not loaded" },
          { label: "Obligations", value: formatNumber(all.reduce((t, r) => t + r.citations, 0)), sub: "Across all loaded versions" },
        ]}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by framework name, ID or description…" className="pl-8" aria-label="Search frameworks" />
          </div>
          <Select value={s.type} onChange={(v) => set({ type: v })} allLabel="All categories" options={(facets?.types ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Category" />
          <Select value={s.group} onChange={(v) => set({ group: v })} allLabel="All groups" options={(facets?.groups ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Group" />
          <Select value={s.jurisdiction} onChange={(v) => set({ jurisdiction: v })} allLabel="All jurisdictions" options={(facets?.jurisdictions ?? []).map((f) => ({ value: f.value, label: f.value, hint: f.count }))} aria-label="Jurisdiction" />
          <Select
            value={s.versions} onChange={(v) => set({ versions: v })} allLabel="All versions" aria-label="Versions"
            options={[{ value: "current", label: "Current versions", hint: n("CURRENT") }, { value: "historical", label: "Historical versions", hint: n("PREVIOUS") + n("RECORDED") }]}
          />
          {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", type: "", jurisdiction: "", group: "", versions: "" }); }}><X /> Clear</Button>}
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{rows.length} versions · {formatNumber(rows.reduce((t, r) => t + r.citations, 0))} obligations · select a row for its detail</div>
        <DataTable
          columns={columns}
          data={data ? rows : undefined}
          loading={isLoading}
          error={error}
          onRetry={refetch}
          rowKey={(r) => r.id}
          sort={{ id: s.sort, desc: s.dir === "desc" }}
          onSortChange={(x: SortState) => set({ sort: x?.id ?? "framework", dir: x ? (x.desc ? "desc" : "asc") : "asc" })}
          // A version known only from the publisher has no page of its own: open the version that replaced it.
          onRowClick={(r) => navigate(`/frameworks/${r.versionStatus === "RECORDED" ? r.supersededBy!.id : r.id}`)}
        />
      </Card>
    </Page>
  );
}
