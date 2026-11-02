"use client";
import Link from "next/link";
import { useMemo } from "react";
import { BookOpenText, ExternalLink, Search, X } from "lucide-react";
import { EmptyState, Mono, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useNavigate } from "@/components/shell/nav-progress";
import { useUrlState } from "@/lib/client/hooks";
import { TERMS } from "@/lib/terms";
import { formatDate, formatNumber } from "@/lib/utils";
import type { SourceRow } from "@/lib/queries/sources";

export const UPDATE_STATUS = {
  REVIEW: { label: "Update to review", tone: "warning" as const },
  MONITORED: { label: "Monitored", tone: "info" as const },
  NOT_MONITORED: { label: "Not monitored", tone: "neutral" as const },
};

const facet = (rows: SourceRow[], k: (r: SourceRow) => string | null) =>
  [...rows.reduce((m, r) => { const v = k(r); if (v) m.set(v, (m.get(v) ?? 0) + 1); return m; }, new Map<string, number>())]
    .sort((a, b) => a[0].localeCompare(b[0])).map(([value, n]) => ({ value, label: value, hint: n }));

export function SourcesCatalog({ docs }: { docs: SourceRow[] }) {
  const navigate = useNavigate();
  const [s, set] = useUrlState({ q: "", type: "", publisher: "", industry: "", status: "" });
  const rows = useMemo(
    () => docs.filter((d) =>
      (!s.q || `${d.name} ${d.sourceId} ${d.publisher}`.toLowerCase().includes(s.q.toLowerCase())) &&
      (!s.type || d.type === s.type) && (!s.publisher || d.publisher === s.publisher) &&
      (!s.industry || d.industry === s.industry) && (!s.status || d.updateStatus === s.status)),
    [docs, s],
  );
  const active = [s.q, s.type, s.publisher, s.industry, s.status].some(Boolean);

  return (
    <Page>
      <PageHeader
        title={TERMS.sources}
        description="The catalogue of authoritative documents: what each one is, its current and previous version, when it was last published, and whether an update is waiting for review."
      />
      {!docs.length ? (
        <Card><EmptyState icon={BookOpenText} title="No authoritative documents loaded" description={`Import the document library under ${TERMS.data}.`} /></Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <Input value={s.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search document name or ID…" className="pl-8" aria-label="Search documents" />
            </div>
            <Select value={s.publisher} onChange={(v) => set({ publisher: v })} allLabel="All publishers" options={facet(docs, (d) => d.publisher)} aria-label="Publisher" />
            <Select value={s.type} onChange={(v) => set({ type: v })} allLabel="All document types" options={facet(docs, (d) => d.type)} aria-label="Document type" />
            <Select value={s.industry} onChange={(v) => set({ industry: v })} allLabel="All industries" options={facet(docs, (d) => d.industry)} aria-label="Industry" />
            <Select value={s.status} onChange={(v) => set({ status: v })} allLabel="Any update status" options={Object.entries(UPDATE_STATUS).map(([value, x]) => ({ value, label: x.label }))} aria-label="Update status" />
            {active && <Button variant="ghost" size="sm" onClick={() => set({ q: "", type: "", publisher: "", industry: "", status: "" })}><X /> Clear</Button>}
          </div>
          <div className="px-4 py-2 text-xs text-muted tabular">{rows.length} of {docs.length} documents · IT/OT applicability: classification to follow</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Document</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Industry</th>
                  <th className="px-3 py-2">Current version</th><th className="px-3 py-2">Previous version</th><th className="px-3 py-2">Last published</th>
                  <th className="px-3 py-2">Update status</th><th className="px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const st = UPDATE_STATUS[d.updateStatus as keyof typeof UPDATE_STATUS];
                  return (
                    <tr key={d.id} onClick={() => navigate(`/sources/${d.id}`)} className="cursor-pointer border-b border-border align-top last:border-0 hover:bg-surface-2">
                      <td className="min-w-[260px] px-4 py-2.5">
                        <div className="font-medium text-fg">{d.short}</div>
                        <div className="line-clamp-1 text-[11px] text-muted">{d.publisher} · <Mono className="text-[11px]">{d.sourceId}</Mono> · {formatNumber(d.obligations)} obligations</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-2">{d.type ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-2">{d.industry ?? "—"}</td>
                      <td className="px-3 py-2.5"><Mono className="text-xs">{d.version ?? "—"}</Mono></td>
                      <td className="px-3 py-2.5">{d.previousVersion ? <Link href={`/sources/${d.previousVersion.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs text-accent hover:underline">{d.previousVersion.version ?? d.previousVersion.short}</Link> : <span className="text-xs text-subtle">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-2">{d.publishedDate ? formatDate(d.publishedDate) : <span className="text-subtle">Not available</span>}</td>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-1.5 whitespace-nowrap text-xs"><Dot tone={st.tone} />{st.label}</span></td>
                      <td className="px-4 py-2.5">
                        {d.documentUrl ? <a href={d.documentUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-accent" aria-label="Open official source"><ExternalLink className="size-3.5" /></a> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <EmptyState title="No documents match" />}
          </div>
        </Card>
      )}
      <p className="mt-3 text-[11px] text-subtle">“Last published” is the date reported by the official source where it is monitored, never the date the platform checked it. <Badge tone="outline">Placeholder</Badge> marks content still to be provided.</p>
    </Page>
  );
}
