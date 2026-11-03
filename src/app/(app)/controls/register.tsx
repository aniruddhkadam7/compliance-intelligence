"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { FileSpreadsheet, GitCompareArrows, History, Search, Upload, X } from "lucide-react";
import { EmptyState, Mono, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import { CONTROL_DEFAULTS } from "@/lib/client/prefetch";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { TERMS } from "@/lib/terms";
import { ClientControlActions } from "@/components/client-control-actions";

interface ControlRow {
  id: string; controlName: string; title: string | null; category: string | null; subCategory: string | null; scope: string | null;
  technicalType: string | null; productTeamFacing: string | null;
  review: { updateId: string; label: string; count: number } | null;
  _count: { testProcedures: number; evidence: number; frameworkReferences: number; obligations: number };
}

export function ControlRegister() {
  const navigate = useNavigate();
  const [s, set] = useUrlState(CONTROL_DEFAULTS);
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 300);
  useEffect(() => {
    if (dq !== s.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const page = Number(s.page) || 1;

  // Last completed workbook import that loaded these controls.
  const lastSync = useQuery({
    queryKey: ["last-ccf-import"],
    queryFn: () =>
      apiGet<{ items: { kind: string; status: string; fileName: string; completedAt: string | null }[] }>("/api/import?view=jobs&pageSize=20")
        .then((r) => r.items.find((j) => j.kind === "CLIENT_CONTROLS" && j.status === "COMPLETED") ?? null),
  });
  const list = useQuery({
    queryKey: ["controls", s],
    queryFn: () => apiGet<{ items: ControlRow[]; total: number }>(`/api/controls${qs({ ...s, page })}`),
    placeholderData: keepPreviousData,
  });

  const facets = useQuery({
    queryKey: ["control-facets"],
    queryFn: () => apiGet<{
      frameworks: { family: string; controls: number; versions: { id: string; short: string; controls: number }[] }[];
      categories: { value: string; count: number }[]; scopes: { value: string; count: number }[]; prefixes: { value: string; count: number }[];
    }>("/api/controls?view=facets"),
  });
  const fam = facets.data?.frameworks.find((f) => f.family === s.family);

  const columns = useMemo<ColumnDef<ControlRow, unknown>[]>(() => [
    { id: "controlName", header: "Control ID", size: 160, cell: ({ row }) => <span className="flex items-center gap-2"><Mono className="whitespace-nowrap font-medium text-fg">{row.original.controlName}</Mono>{row.original.review && <Badge tone="warning" title={`${row.original.review.label}: ${row.original.review.count} mapping change(s) to review`}><GitCompareArrows /> Mapping affected</Badge>}</span> },
    { id: "title", header: "Control title", cell: ({ row }) => <div className="line-clamp-2 text-fg">{row.original.title ?? <span className="text-subtle">No title</span>}</div> },
  ], []);

  const active = !!(s.q || s.mapping || s.family || s.category || s.scope || s.prefix);
  const opts = (xs?: { value: string; count: number }[]) => (xs ?? []).map((x) => ({ value: x.value, label: x.value, hint: formatNumber(x.count) }));

  // Client layer is empty until the client uploads its controls.
  if (list.data && list.data.total === 0 && !active)
    return (
      <Page>
        <PageHeader title={TERMS.clientControls} description="The client's internal controls and the regulatory obligations each one is mapped to." />
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No client control data imported"
            description={
              <>
                Upload the client&apos;s controls under {TERMS.data} using the Excel template (Client Control ID, Control Name, Control Description,
                Test Procedure ID, Test Procedure Description, Relevant Framework, Source ID / Section ID). Source IDs are resolved against the document
                library and unknown IDs are reported. For a demonstration, load the ten sample controls; they are clearly labelled and are not client data.
              </>
            }
            action={<ClientControlActions empty />}
          />
        </Card>
      </Page>
    );

  return (
    <Page>
      <PageHeader
        title={TERMS.clientControls}
        description="The client's internal controls and the regulatory obligations each one is mapped to."
        meta={lastSync.data ? (
          <Badge tone="outline"><History /> Last sync {formatDateTime(lastSync.data.completedAt)} · {lastSync.data.fileName}</Badge>
        ) : null}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search control ID or title…" className="pl-8" aria-label="Search controls" />
          </div>
          <Select
            value={s.family} onChange={(v) => set({ family: v, frameworkId: "" })} allLabel="All frameworks" placeholder="Framework / regulation"
            options={(facets.data?.frameworks ?? []).map((f) => ({ value: f.family, label: f.family, hint: formatNumber(f.controls) }))}
            aria-label="Filter by framework or regulation"
          />
          {fam && fam.versions.length > 1 && (
            <Select
              value={s.frameworkId} onChange={(v) => set({ frameworkId: v })} allLabel="All versions" placeholder="Version"
              options={fam.versions.map((v) => ({ value: v.id, label: v.short, hint: formatNumber(v.controls) }))}
              aria-label="Filter by framework version"
            />
          )}
          <Select value={s.category} onChange={(v) => set({ category: v })} allLabel="All categories" placeholder="Category" options={opts(facets.data?.categories)} aria-label="Filter by category" />
          <Select value={s.scope} onChange={(v) => set({ scope: v })} allLabel="All scopes" placeholder="Scope" options={opts(facets.data?.scopes)} aria-label="Filter by scope" />
          <Select value={s.prefix} onChange={(v) => set({ prefix: v })} allLabel="All domains" placeholder="Domain" options={opts(facets.data?.prefixes)} aria-label="Filter by control domain" />
          <Select
            value={s.mapping === "review" ? "" : s.mapping} onChange={(v) => set({ mapping: v })} allLabel="Any mapping status" placeholder="Mapping status"
            options={[{ value: "mapped", label: "Mapped" }, { value: "unmapped", label: "Unmapped" }, { value: "conflict", label: "Mapping conflict" }]}
            aria-label="Filter by mapping status"
          />
          <Button variant={s.mapping === "review" ? "primary" : "secondary"} size="sm" onClick={() => set({ mapping: s.mapping === "review" ? "" : "review", page: "1" })}><GitCompareArrows /> Needs review</Button>
          {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", mapping: "", family: "", frameworkId: "", category: "", scope: "", prefix: "" }); }}><X /> Clear</Button>}
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{list.data ? `${formatNumber(list.data.total)} controls` : "…"}</div>
        <DataTable
          columns={columns}
          data={list.data?.items}
          total={list.data?.total}
          page={page}
          onPageChange={(p) => set({ page: String(p) })}
          sort={{ id: s.sort, desc: s.dir === "desc" }}
          onSortChange={(x) => set({ sort: x?.id ?? "controlName", dir: x?.desc ? "desc" : "asc" })}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/controls/${encodeURIComponent(r.controlName)}`)}
        />
      </Card>
    </Page>
  );
}
