"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Columns3, FileX, Search, TableProperties, TriangleAlert, Upload } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dropdown, DropdownCheckboxItem, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import type { CcmCrosswalk, CcmCrosswalkResponse, ImportRef } from "@/lib/queries/ccm-crosswalk";
import { formatDateTime, formatNumber } from "@/lib/utils";

const PAGE = 10;
/** Mapped controls listed in a cell before "+N more". */
const SHOWN = 3;

/**
 * CCM-based cross-framework mapping: one row per CSA CCM control (the base framework) and, per framework column, the
 * controls it is mapped to in the imported cross-framework mapping workbooks. Read-only; nothing is generated.
 */
export function CcmCrosswalkView() {
  const [s, set] = useUrlState({ q: "", domain: "", fw: "", to: "", page: "1" });
  const [q, setQ] = useState(s.q);
  const debounced = useDebounced(q);
  const res = useQuery({ queryKey: ["ccm-crosswalk"], queryFn: () => apiGet<CcmCrosswalkResponse>("/api/ccm-crosswalk") });
  const { isLoading, error, refetch } = res;
  // Only a completed import yields table data; every other state is described below and shows no controls or counts.
  const data = res.data?.state === "READY" ? res.data.data : null;

  // Framework columns: the user's choice (in the URL), else the suggested ISO, NIST and EU frameworks.
  const shown = useMemo(() => {
    if (!data) return [];
    const ids = s.fw ? s.fw.split(",") : data.suggested;
    return data.frameworks.filter((f) => ids.includes(f.id));
  }, [data, s.fw]);
  const setColumns = (ids: string[]) => set({ fw: ids.join(","), page: "1" });
  const toggle = (id: string, on: boolean) => setColumns(on ? [...shown.map((f) => f.id), id] : shown.map((f) => f.id).filter((x) => x !== id));

  const domains = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.domain))].sort(), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = debounced.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (s.domain && r.domain !== s.domain) return false;
      if (s.to && !r.maps[s.to]?.length) return false;
      if (!term) return true;
      if ([r.identifier, r.title, r.statement].some((t) => t?.toLowerCase().includes(term))) return true;
      // Also finds a CCM control by a control it is mapped to in the frameworks shown, e.g. "PR.AC-1" or "Article 32".
      return shown.some((f) => (r.maps[f.id] ?? []).some((sid) => {
        const m = data.sections[sid];
        return m.identifier.toLowerCase().includes(term) || m.title.toLowerCase().includes(term);
      }));
    });
  }, [data, debounced, s.domain, s.to, shown]);

  if (isLoading) return <Skeleton className="h-[520px]" />;
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;
  if (!res.data || !data) return <NoTable state={res.data?.state ?? "NO_DATA"} attempt={res.data?.attempt ?? null} />;
  const { source, attempt } = res.data;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(Math.max(1, Number(s.page) || 1), pages);
  const visible = rows.slice((page - 1) * PAGE, page * PAGE);
  const fwLabel = (id: string) => data.frameworks.find((f) => f.id === id)?.short ?? "";

  return (
    <Card>
      <CardHeader
        icon={<TableProperties />}
        title={<>CCM-based cross-framework mapping <Badge tone="accent">Base framework: {data.base.short}</Badge></>}
        description={<>
          One row per {data.base.short} control ({formatNumber(data.base.controls)}) with the controls it is mapped to in each framework. Read-only.
          {source && <span className="mt-0.5 block">Source: <span className="text-fg-2">{source.fileName}</span>, imported {formatDateTime(source.at)} · {formatNumber(source.links)} CCM mappings</span>}
        </>}
      />
      {attempt && <AttemptNotice attempt={attempt} />}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative w-full max-w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            value={q} placeholder="Search CCM or mapped control ID, title…" className="pl-8" aria-label="Search controls"
            onChange={(e) => { setQ(e.target.value); set({ q: e.target.value, page: "1" }); }}
          />
        </div>
        <Select value={s.domain} onChange={(v) => set({ domain: v, page: "1" })} allLabel="All CCM domains" options={domains.map((d) => ({ value: d, label: d }))} triggerClassName="min-w-[200px]" aria-label="CCM domain" />
        <Select
          value={s.to} onChange={(v) => set({ to: v, page: "1" })} allLabel="Mapped to any framework" triggerClassName="min-w-[220px]" aria-label="Mapped to"
          options={data.frameworks.map((f) => ({ value: f.id, label: `Mapped to ${f.short}`, hint: formatNumber(f.controls) }))}
        />
        <Dropdown>
          <DropdownTrigger asChild><Button size="sm"><Columns3 /> Frameworks shown ({shown.length})</Button></DropdownTrigger>
          <DropdownContent className="max-h-[360px] w-[300px] overflow-y-auto">
            <DropdownLabel>Framework columns · CCM controls mapped</DropdownLabel>
            {data.frameworks.map((f) => (
              <DropdownCheckboxItem key={f.id} checked={shown.some((x) => x.id === f.id)} onCheckedChange={(on) => toggle(f.id, !!on)}>
                <span className="truncate">{f.short}</span><span className="ml-auto pl-3 text-[11px] text-subtle tabular">{f.controls}</span>
              </DropdownCheckboxItem>
            ))}
            <DropdownSeparator />
            <DropdownItem onSelect={() => set({ fw: "", page: "1" })}>Reset to ISO, NIST and EU</DropdownItem>
            <DropdownItem onSelect={() => setColumns(data.frameworks.map((f) => f.id))}>Show all {data.frameworks.length}</DropdownItem>
          </DropdownContent>
        </Dropdown>
        {(s.q || s.domain || s.to) && <Button size="sm" variant="ghost" onClick={() => { setQ(""); set({ q: "", domain: "", to: "", page: "1" }); }}>Clear filters</Button>}
      </div>

      {!rows.length ? (
        <EmptyState icon={Search} title="No CCM controls match" description="Change the search or filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-left text-xs">
            <thead className="bg-surface-2">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 w-[90px] min-w-[90px] bg-surface-2 px-4 py-2">CCM ID</th>
                <th className="sticky left-[90px] z-10 w-[260px] min-w-[260px] border-r border-border bg-surface-2 px-3 py-2">CCM control title</th>
                {shown.map((f) => (
                  <th key={f.id} className="w-[240px] min-w-[240px] px-3 py-2">
                    {f.short}
                    <div className="mt-0.5 font-normal normal-case tracking-normal text-subtle">{f.controls} of {data.base.controls} CCM controls mapped</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.sourceSectionId} className="group border-b border-border align-top last:border-0">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 group-hover:bg-surface-2">
                    <Link href={`/citations?citation=${r.sourceSectionId}`} className="font-mono font-medium text-fg hover:text-accent">{r.identifier}</Link>
                    <div className="mt-0.5 text-[11px] text-subtle">{r.domain}</div>
                  </td>
                  <td className="sticky left-[90px] z-10 border-r border-border bg-surface px-3 py-2.5 group-hover:bg-surface-2">
                    {r.title && <div className="font-medium text-fg">{r.title}</div>}
                    {r.statement && <p className={r.title ? "mt-0.5 line-clamp-2 text-muted" : "line-clamp-3 text-fg-2"} title={r.statement}>{r.statement}</p>}
                  </td>
                  {shown.map((f) => <MappedCell key={f.id} ids={r.maps[f.id] ?? []} data={data} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs">
        <span className="tabular text-muted">
          {rows.length ? `${formatNumber((page - 1) * PAGE + 1)}–${formatNumber((page - 1) * PAGE + visible.length)} of ${formatNumber(rows.length)} CCM controls` : "0 CCM controls"}
          {s.to && ` mapped to ${fwLabel(s.to)}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft /> Previous</Button>
          <span className="px-2 tabular text-muted">Page {page} of {pages}</span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page">Next <ChevronRight /></Button>
        </div>
      </div>
    </Card>
  );
}

/** The controls of one framework a CCM control is mapped to: publisher ID and title, the full heading on hover. */
function MappedCell({ ids, data }: { ids: string[]; data: CcmCrosswalk }) {
  const [open, setOpen] = useState(false);
  if (!ids.length) return <td className="px-3 py-2.5 text-subtle">Not mapped</td>;
  const list = open ? ids : ids.slice(0, SHOWN);
  return (
    <td className="px-3 py-2.5">
      <ul className="space-y-1">
        {list.map((sid) => {
          const m = data.sections[sid];
          return (
            <li key={sid} title={m.heading}>
              <Link href={`/citations?citation=${sid}`} className="font-mono font-medium text-fg hover:text-accent">{m.identifier}</Link>
              {m.title && <span className="ml-1.5 text-muted">{m.title}</span>}
            </li>
          );
        })}
      </ul>
      {ids.length > SHOWN && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-[11px] font-medium text-accent hover:underline">
          {open ? "Show less" : `+${ids.length - SHOWN} more`}
        </button>
      )}
    </td>
  );
}

const IMPORT_LINK = "/data?tab=import";

/** Every state without a completed CCM mapping import: no table, no counts, and what to do next. */
function NoTable({ state, attempt }: { state: CcmCrosswalkResponse["state"]; attempt: ImportRef | null }) {
  const go = (label: string, href = IMPORT_LINK) => <Button asChild variant="primary"><Link href={href}><Upload /> {label}</Link></Button>;
  const file = attempt ? <><span className="font-medium text-fg-2">{attempt.fileName}</span> ({formatDateTime(attempt.at)})</> : null;
  if (state === "AWAITING_IMPORT")
    return (
      <Card>
        <EmptyState
          icon={Clock} title="Awaiting Import"
          description={<>{file} was uploaded and validated but has not been imported, so its mappings are not shown yet.{attempt?.errors ? ` Validation found ${attempt.errors} error${attempt.errors === 1 ? "" : "s"}; fix the workbook and upload it again.` : " Confirm the import in Data & Imports (upload the file again if that page was closed)."}</>}
          action={go("Go to Data & Imports")}
        />
      </Card>
    );
  if (state === "IMPORT_FAILED")
    return (
      <Card>
        <EmptyState
          icon={FileX} title="Import failed"
          description={<>{file} could not be imported{attempt?.errors ? ` (${attempt.errors} error${attempt.errors === 1 ? "" : "s"})` : ""}. Nothing was written, so no CCM mapping data is available. Fix the workbook and upload it again.</>}
          action={<div className="flex gap-2">{go("Upload again")}<Button asChild><Link href="/data?tab=history">View import history</Link></Button></div>}
        />
      </Card>
    );
  return (
    <Card>
      <EmptyState
        icon={TableProperties} title="No CCM mapping data available"
        description={state === "EMPTY_IMPORT" && attempt
          ? <>The last import, {file}, completed but contained no mappings to CSA CCM controls. Upload a workbook with a cross-framework mapping sheet that includes CSA CCM, then import it.</>
          : "Upload a workbook with a cross-framework mapping sheet that includes CSA CCM under Data & Imports, validate it, then import it. The mapping table appears after a successful import."}
        action={go("Upload a mapping workbook")}
      />
    </Card>
  );
}

/** A newer upload that was not imported, shown above the table built from the last successful import. */
function AttemptNotice({ attempt }: { attempt: ImportRef }) {
  const failed = attempt.status === "FAILED";
  return (
    <div className="flex items-start gap-2 border-b border-border bg-warning-soft px-4 py-2 text-xs text-warning">
      {failed ? <TriangleAlert className="mt-px size-3.5 shrink-0" /> : <Clock className="mt-px size-3.5 shrink-0" />}
      <span>
        {failed ? "Import failed" : "Awaiting Import"}: <b>{attempt.fileName}</b> ({formatDateTime(attempt.at)}) {failed ? "could not be imported" : "was uploaded and validated but not imported"}.
        {" "}The table still shows the last successful import. <Link href={failed ? "/data?tab=history" : IMPORT_LINK} className="underline">{failed ? "View import history" : "Go to Data & Imports"}</Link>
      </span>
    </div>
  );
}
