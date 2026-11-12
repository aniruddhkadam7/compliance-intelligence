"use client";
// CCF Cross Mapping: the uploaded custom controls against the frameworks, at control level. One row per custom control
// and, per framework, the sections it is mapped to in the uploaded workbook. No test procedures (L2) or obligation
// wording (L4): those stay on each control's own page under Traceability.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Upload, X } from "lucide-react";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { apiGet } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import type { CcfCrossMapping } from "@/lib/queries/custom-mapping";
import { TERMS } from "@/lib/terms";
import { cn, formatNumber } from "@/lib/utils";

const PAGE = 10;
const DEFAULT_COLUMNS = 4;
const SHOWN = 6;

export function CcfCrossMappingView() {
  const [s, set] = useUrlState({ fw: "", q: "", page: "1" });
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 250);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (dq !== s.q) set({ q: dq, page: "1" }); }, [dq]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["ccf-mapping"], queryFn: () => apiGet<CcfCrossMapping>("/api/ccf-mapping") });

  // Columns: the frameworks picked, or the ones most custom controls map to.
  const columns = useMemo(() => {
    const all = data?.frameworks ?? [];
    const picked = s.fw ? s.fw.split(",").filter((id) => all.some((f) => f.id === id)) : all.slice(0, DEFAULT_COLUMNS).map((f) => f.id);
    return all.filter((f) => picked.includes(f.id));
  }, [data, s.fw]);
  const toggle = (id: string) => {
    const ids = columns.map((f) => f.id);
    set({ fw: (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]).join(",") || "none" });
  };

  const rows = useMemo(() => {
    const term = s.q.trim().toLowerCase();
    return (data?.controls ?? []).filter((c) => !term || `${c.name} ${c.title ?? ""}`.toLowerCase().includes(term)
      || columns.some((f) => (c.mappings[f.id] ?? []).some((m) => `${m.identifier} ${m.title}`.toLowerCase().includes(term))));
  }, [data, s.q, columns]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(s.page) || 1));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <Page>
      <PageHeader
        title={TERMS.ccfMapping}
        description="Your custom controls (CCF) against each framework: the sections every control is mapped to in the uploaded mapping workbook. Control level only; open a control for its test procedures and obligations."
      />
      {isLoading ? <Skeleton className="h-[420px]" /> : error ? <Card><ErrorState error={error} onRetry={refetch} /></Card> : !data?.controls.length ? (
        <Card>
          <EmptyState icon={ShieldCheck} title="No custom controls uploaded yet" description="Import the CCF workbook under Data & Imports; its controls and their framework mappings appear here."
            action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>} />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Frameworks shown <span className="font-normal normal-case tracking-normal text-subtle">· number of custom controls mapped</span></div>
            <div className="flex flex-wrap gap-1.5">
              {data.frameworks.map((f) => {
                const on = columns.some((c) => c.id === f.id);
                return (
                  <button key={f.id} onClick={() => toggle(f.id)} aria-pressed={on}
                    className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-accent bg-accent-soft font-medium text-fg" : "border-border text-fg-2 hover:border-border-strong")}>
                    {f.short} <span className="tabular text-muted">{f.controls}</span>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search control ID, title or mapped section…" className="pl-8" aria-label="Search controls" />
              </div>
              {s.q && <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", page: "1" }); }}><X /> Clear</Button>}
              <span className="ml-auto text-xs tabular text-muted">{formatNumber(rows.length)} of {formatNumber(data.controls.length)} custom controls</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-surface-2">
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="sticky left-0 z-10 w-[240px] bg-surface-2 px-4 py-2">Custom control</th>
                    {columns.map((f) => <th key={f.id} className="min-w-[180px] px-3 py-2 normal-case tracking-normal"><span className="text-[11px] font-semibold text-fg-2">{f.short}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.name} className="border-b border-border align-top last:border-0">
                      <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                        <Link href={`/controls/${encodeURIComponent(c.name)}`} className="font-mono font-medium text-fg hover:text-accent">{c.name}</Link>
                        {c.title && <div className="line-clamp-2 text-muted">{c.title}</div>}
                      </td>
                      {columns.map((f) => {
                        const m = c.mappings[f.id] ?? [];
                        return (
                          <td key={f.id} className="px-3 py-2.5">
                            {!m.length ? <span className="text-subtle">—</span> : (
                              <div className="flex flex-wrap gap-1">
                                {m.slice(0, SHOWN).map((x) => (
                                  <Tooltip key={x.sourceSectionId} content={x.title || x.identifier}>
                                    <Link href={`/citations?citation=${x.sourceSectionId}`} className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-fg-2 hover:border-border-strong hover:text-fg">{x.identifier}</Link>
                                  </Tooltip>
                                ))}
                                {m.length > SHOWN && <Link href={`/controls/${encodeURIComponent(c.name)}`} className="px-1 py-0.5 text-[11px] text-muted hover:text-fg">+{m.length - SHOWN} more</Link>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted">No custom controls match.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <Button size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}><ChevronLeft /> Previous</Button>
              <Button size="sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next <ChevronRight /></Button>
              <span className="ml-auto text-xs tabular text-muted">Page {page} of {pages} · {PAGE} controls per page</span>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
