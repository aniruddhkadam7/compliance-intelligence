"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenText, ExternalLink, GitCompareArrows, Library, Network, ShieldCheck } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ErrorState, KeyValue, LongText, Mono, Provenance, SectionTitle } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/client/api";
import { mappingLabel } from "@/lib/labels";

interface CitationDetail {
  id: string;
  sourceSectionId: string;
  sectionName: string;
  sectionText: string | null;
  authSource: string;
  sectionPath: string[];
  sourceSheet: string;
  sourceRow: number;
  framework: { id: string; name: string; short: string; sourceId: string; versionLabel: string | null; documentUrl: string | null; type: string | null; jurisdiction: string | null };
  controls: { id: string; mappingType: string; control: { id: string; controlName: string; title: string | null; category: string | null } }[];
  procedures: { testProcedure: { procedureId: string | null; control: { controlName: string } } }[];
  related: {
    id: string; kind: "VERSION_TRANSITION" | "CROSS_FRAMEWORK"; status: string; note: string | null; direction: "to" | "from"; sourceId: string | null;
    citation: { id: string; sourceSectionId: string; sectionName: string; framework: { id: string; short: string } } | null;
  }[];
}

const STATUS_LABEL: Record<string, string> = { UNCHANGED: "Unchanged", MODIFIED: "Modified", ADDED: "Added", REMOVED: "Removed / retired", SPLIT: "Split", COMBINED: "Combined" };

function Related({ title, icon, items, onOpen }: { title: string; icon: React.ReactNode; items: CitationDetail["related"]; onOpen: (sectionId: string) => void }) {
  return (
    <section className="p-5">
      <SectionTitle>{title}</SectionTitle>
      {items.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((r) => (
            <li key={r.id} className="flex items-start gap-2 px-3 py-2 text-xs">
              <span className="mt-0.5 text-accent">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted">{r.kind === "VERSION_TRANSITION" ? (r.direction === "to" ? "Becomes" : "Previously") : "Related to"}</span>
                  {r.citation ? (
                    <button onClick={() => onOpen(r.citation!.sourceSectionId)} className="font-mono font-medium text-fg hover:text-accent">{r.citation.sourceSectionId}</button>
                  ) : (
                    <span className="text-subtle">{r.sourceId ?? "no counterpart"}</span>
                  )}
                  {r.citation && <span className="text-muted">· {r.citation.framework.short}</span>}
                </div>
                {r.citation && <div className="line-clamp-1 text-[11px] text-muted">{r.citation.sectionName}</div>}
                {r.note && <div className="text-[11px] text-subtle">{r.note}</div>}
              </div>
              <Badge tone={r.status === "UNCHANGED" ? "neutral" : r.status === "REMOVED" ? "danger" : r.status === "ADDED" ? "success" : "info"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">None supplied for this obligation yet.</p>
      )}
    </section>
  );
}

export function CitationDetailSheet({ citationId, onClose, onOpen }: { citationId: string | null; onClose: () => void; onOpen?: (sectionId: string) => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["citation", citationId],
    queryFn: () => apiGet<CitationDetail>(`/api/citations/${encodeURIComponent(citationId!)}`),
    enabled: !!citationId,
  });

  const controls = data?.controls ?? [];
  // Test procedures that cite this obligation, grouped by control.
  const proceduresByControl = new Map<string, string[]>();
  for (const p of data?.procedures ?? []) {
    const k = p.testProcedure.control.controlName;
    if (p.testProcedure.procedureId) proceduresByControl.set(k, [...(proceduresByControl.get(k) ?? []), p.testProcedure.procedureId]);
  }

  return (
    <Sheet
      open={!!citationId}
      onOpenChange={(o) => !o && onClose()}
      title={data ? <span className="flex items-center gap-2">Obligation <Mono className="text-[13px]">{data.sourceSectionId}</Mono></span> : "Obligation"}
      description={data ? data.framework.short : undefined}
    >
      {isLoading && <div className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
      {!!error && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <div className="divide-y divide-border">
          <section className="space-y-4 p-5">
            <div>
              <Badge tone="info" className="mb-2">Regulatory obligation</Badge>
              <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
                {data.sectionPath.map((p, i) => (
                  <li key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-subtle">/</span>}
                    <span className={i === data.sectionPath.length - 1 ? "font-medium text-fg" : ""}>{p}</span>
                  </li>
                ))}
              </ol>
            </div>
            <KeyValue
              items={[
                { label: "Source ID", value: <Mono>{data.sourceSectionId}</Mono> },
                { label: "Framework", value: <Link href={`/frameworks/${data.framework.id}`} className="text-accent hover:underline">{data.framework.short}</Link> },
                { label: "Framework version", value: data.framework.versionLabel, hint: "Derived from the framework name" },
                { label: "Framework ID", value: <Mono>{data.framework.sourceId}</Mono> },
                { label: "Requirement title", value: data.sectionPath[data.sectionPath.length - 1] },
                { label: "Framework full name", value: data.authSource },
              ]}
            />
          </section>

          <section className="p-5">
            <SectionTitle>Source traceability</SectionTitle>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-center gap-2"><BookOpenText className="size-3.5 text-subtle" /><Link href={`/sources/${data.framework.id}`} className="text-accent hover:underline">{data.framework.short}</Link><span className="text-muted">in the Source Index (versions, changes, monitoring)</span></li>
              <li className="flex items-center gap-2"><Library className="size-3.5 text-subtle" /><Link href={`/frameworks/${data.framework.id}`} className="text-accent hover:underline">Framework Repository entry</Link><span className="text-muted">· Framework ID <Mono className="text-[11px]">{data.framework.sourceId}</Mono></span></li>
              <li className="flex items-center gap-2"><ArrowRight className="size-3.5 text-subtle" /><span className="text-muted">Imported from</span><Provenance sheet={data.sourceSheet} row={data.sourceRow} /></li>
              {data.framework.documentUrl && <li className="flex items-center gap-2"><ExternalLink className="size-3.5 text-subtle" /><a href={data.framework.documentUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Original source document</a></li>}
            </ol>
          </section>

          <section className="p-5">
            <SectionTitle>Requirement description</SectionTitle>
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <LongText text={data.sectionText} lines={10} />
            </div>
          </section>

          {onOpen && (
            <>
              <Related title="Version transitions (supplied)" icon={<GitCompareArrows className="size-3.5" />} items={data.related.filter((r) => r.kind === "VERSION_TRANSITION")} onOpen={onOpen} />
              <Related title="Related sections in other documents (supplied)" icon={<Network className="size-3.5" />} items={data.related.filter((r) => r.kind === "CROSS_FRAMEWORK")} onOpen={onOpen} />
            </>
          )}

          {controls.length > 0 && (
          <section className="p-5">
            <SectionTitle>Client controls mapped (client data)</SectionTitle>
            {(
              <ul className="divide-y divide-border rounded-md border border-border">
                {controls.map((c) => (
                  <li key={c.control.id}>
                    <Link href={`/controls/${encodeURIComponent(c.control.controlName)}`} className="flex items-start gap-2 px-3 py-2 text-xs hover:bg-surface-2">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                      <span className="font-mono font-medium text-fg">{c.control.controlName}</span>
                      <span className="min-w-0 flex-1 truncate text-fg-2">{c.control.title}</span>
                      {proceduresByControl.has(c.control.controlName) ? (
                        <span className="flex flex-wrap justify-end gap-1">{proceduresByControl.get(c.control.controlName)!.map((p) => <Badge key={p} tone="accent" className="font-mono">{p.split(":").pop()}</Badge>)}</span>
                      ) : (
                        <Badge tone={c.mappingType === "SECONDARY" ? "outline" : "accent"}>{mappingLabel(c.mappingType)}</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
