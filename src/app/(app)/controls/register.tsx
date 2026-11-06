"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { ArrowRight, BellRing, Check, FileSpreadsheet, History, Search, X } from "lucide-react";
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
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { TERMS } from "@/lib/terms";
import { ClientControlActions } from "@/components/client-control-actions";

/** A framework update applied in Sources as it affects a control: yellow until its mapping is approved, then green. */
interface UpdateFlag { key: string; family: string; previous: string; current: string; state: "pending" | "updated" | "rejected" }
interface AppliedUpdate { key: string; family: string; previous: string; current: string; uploadedAfter: boolean; affected: number; approved: number; rejected: number }

interface ControlRow {
  id: string; controlName: string; title: string | null; category: string | null; subCategory: string | null; scope: string | null;
  technicalType: string | null; productTeamFacing: string | null;
  review: { updateId: string; label: string; count: number } | null;
  frameworkUpdates: UpdateFlag[];
  inScope: boolean; inClientSelection: boolean;
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
      updates: AppliedUpdate[];
      scope: { total: number; inScope: number; selection: number; selectionInScope: number };
    }>("/api/controls?view=facets"),
  });

  const fam = facets.data?.frameworks.find((f) => f.family === s.family);

  const columns = useMemo<ColumnDef<ControlRow, unknown>[]>(() => [
    { id: "controlName", header: "Control ID", size: 160, cell: ({ row }) => <span className="flex flex-wrap items-center gap-2"><Mono className="whitespace-nowrap font-medium text-fg">{row.original.controlName}</Mono></span> },
    {
      id: "frameworkUpdate", header: "Framework update", size: 190, enableSorting: false,
      cell: ({ row }) => {
        const us = row.original.frameworkUpdates;
        if (!us.length) return <span className="text-xs text-subtle">—</span>;
        return (
          <span className="flex flex-col items-start gap-1">
            {us.map((u) => u.state === "rejected"
              ? <Badge key={u.key} tone="warning" title={`Rejected: this control stays on ${u.family} ${u.previous}. It can be reconsidered in ${TERMS.versionImpact}.`}><X /> {u.family} {u.previous} · rejected</Badge>
              : u.state === "pending"
              ? <Badge key={u.key} tone="warning" title={`Mapped to ${u.family} ${u.previous}; approve the move to ${u.current} in Change Analytics`}><BellRing /> {u.family} {u.previous} → {u.current}</Badge>
              : <Badge key={u.key} tone="success" title={`Mapping approved: now points to ${u.family} ${u.current}`}><Check /> {u.family} {u.current}</Badge>)}
          </span>
        );
      },
    },
    { id: "title", header: "Control title", cell: ({ row }) => <div className="line-clamp-2 text-fg">{row.original.title ?? <span className="text-subtle">No title</span>}</div> },
  ], []);
  // The Framework update column is empty until an update is applied in Sources, so it is shown only then.
  const hasUpdates = (facets.data?.updates.length ?? 0) > 0;
  const shownColumns = useMemo(() => (hasUpdates ? columns : columns.filter((c) => c.id !== "frameworkUpdate")), [columns, hasUpdates]);

  // Framework updates applied in Sources. Yellow until every affected control's mapping is approved, then green.
  const updates = facets.data?.updates ?? [];
  const done = (u: AppliedUpdate) => u.approved >= u.affected;
  const pending = updates.filter((u) => !done(u)).reduce((n, u) => n + u.affected - u.approved - u.rejected, 0);
  const rejected = updates.reduce((n, u) => n + u.rejected, 0);
  const open = updates.some((u) => !done(u));
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
      {updates.length > 0 && (
        <Card className={cn("mb-4", open ? "border-warning/50" : "border-success/40")}>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            {open ? <BellRing className="size-4 text-warning" /> : <Check className="size-4 text-success" />}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">{open ? "Framework updates affect the client's controls" : "Client controls are on the latest framework versions"}</div>
              <div className="text-xs text-muted">
                {pending ? `${formatNumber(pending)} control mapping(s) await approval in ${TERMS.versionImpact}; until then they stay on the previous version.${rejected ? ` ${formatNumber(rejected)} rejected.` : ""}` : open ? `Every control has been reviewed. ${formatNumber(rejected)} rejected control(s) stay on the previous version.` : "Every affected control's mapping has been approved."}
              </div>
            </div>
            {open && (
              <Button size="sm" variant={s.mapping === "update" ? "primary" : "secondary"} onClick={() => set({ mapping: s.mapping === "update" ? "" : "update", frameworkId: "", family: "", page: "1" })}>
                {s.mapping === "update" ? "Show all controls" : "Show affected controls"}
              </Button>
            )}
          </div>
          <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
            {updates.map((u) => {
              const ok = done(u);
              return (
                <li key={u.key} className={cn("flex flex-col gap-2 rounded-md border p-3 text-xs transition-colors", ok ? "border-success/40 bg-success-soft" : "border-warning/50 bg-warning-soft")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-fg">{u.family}</span>
                    <Badge tone={ok ? "success" : "warning"}>{ok ? "Updated" : u.approved + u.rejected >= u.affected ? "Reviewed" : "Approval pending"}</Badge>
                  </div>
                  <div className="font-medium text-fg-2">Newer version: {u.family} {u.previous} <ArrowRight className="inline size-3" /> {u.current}</div>
                  <div className="text-muted">
                    {u.uploadedAfter ? `Controls uploaded after the update map to ${u.current}` : `${formatNumber(u.approved)} of ${formatNumber(u.affected)} affected control${u.affected === 1 ? "" : "s"} approved${u.rejected ? ` · ${formatNumber(u.rejected)} rejected` : ""}`}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <Link href={`/change-analytics?update=${u.key}`} className="font-medium text-fg underline-offset-2 hover:underline">{formatNumber(u.affected)} control{u.affected === 1 ? "" : "s"} affected</Link>
                    <Link href={`/change-analytics?update=${u.key}`} className="inline-flex items-center gap-1 text-muted hover:text-fg">{ok ? "View" : "Review and approve"} <ArrowRight className="size-3" /></Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
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
            options={[{ value: "mapped", label: "Mapped" }, { value: "unmapped", label: "Unmapped" }, { value: "conflict", label: "Mapping conflict" }, { value: "update", label: "Affected by a framework update" }]}
            aria-label="Filter by mapping status"
          />
          {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", mapping: "", family: "", frameworkId: "", category: "", scope: "", prefix: "", inScope: "" }); }}><X /> Clear</Button>}
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{list.data ? `${formatNumber(list.data.total)} controls` : "…"}<span className="text-muted"> · </span><span className="text-accent">click any control to inspect its test procedures and mapped obligations</span></div>
        <DataTable
          columns={shownColumns}
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
