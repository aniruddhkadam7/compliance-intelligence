"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink, ListTree, ShieldCheck } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ErrorState, KeyValue, LongText, Mono, Provenance, SectionTitle } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/client/api";

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
  requirements: {
    requirement: {
      requirementId: string; name: string | null; riskTopic: string | null; riskStatement: string | null; _count: { citations: number };
      mappings: { id: string; mappingType: string; control: { id: string; controlName: string; title: string | null; category: string | null } }[];
    };
  }[];
}

export function CitationDetailSheet({ citationId, onClose }: { citationId: string | null; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["citation", citationId],
    queryFn: () => apiGet<CitationDetail>(`/api/citations/${encodeURIComponent(citationId!)}`),
    enabled: !!citationId,
  });

  return (
    <Sheet
      open={!!citationId}
      onOpenChange={(o) => !o && onClose()}
      title={data ? <span className="flex items-center gap-2">Citation <Mono className="text-[13px]">{data.sourceSectionId}</Mono></span> : "Citation"}
      description={data ? data.framework.short : undefined}
    >
      {isLoading && <div className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
      {!!error && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <div className="divide-y divide-border">
          <section className="space-y-4 p-5">
            <div>
              <Badge tone="info" className="mb-2">Citation · source section</Badge>
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
                { label: "Citation ID (Source Section ID)", value: <Mono>{data.sourceSectionId}</Mono> },
                { label: "Framework", value: <Link href={`/frameworks/${data.framework.id}`} className="text-accent hover:underline">{data.framework.short}</Link> },
                { label: "Framework version", value: data.framework.versionLabel, hint: "Derived from the ArC Source Name" },
                { label: "ArC Source ID", value: <Mono>{data.framework.sourceId}</Mono> },
                { label: "Section title", value: data.sectionPath[data.sectionPath.length - 1] },
                { label: "Auth. Source (as written)", value: data.authSource },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Provenance sheet={data.sourceSheet} row={data.sourceRow} />
              {data.framework.documentUrl && (
                <a href={data.framework.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  Original source document <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </section>

          <section className="p-5">
            <SectionTitle>Section text (original source information)</SectionTitle>
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <LongText text={data.sectionText} lines={10} />
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">From the unlabelled column F of the citation sheet.</p>
          </section>

          <section className="p-5">
            <SectionTitle>Related integrated requirements</SectionTitle>
            <ul className="space-y-3">
              {data.requirements.map(({ requirement: r }) => (
                <li key={r.requirementId} className="rounded-md border border-border">
                  <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ListTree className="size-3.5 text-muted" />
                        <Link href={`/requirements/${r.requirementId}`} className="text-[13px] font-medium text-fg hover:text-accent">IR {r.requirementId} · {r.name}</Link>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">{r.riskTopic} · {r._count.citations} citations in total</div>
                    </div>
                    <Link href={`/requirements/${r.requirementId}`} className="text-muted hover:text-fg" aria-label="Open requirement"><ArrowUpRight className="size-4" /></Link>
                  </div>
                  <div className="border-t border-border bg-surface-2 px-3 py-2.5">
                    <div className="mb-1.5 text-[11px] font-medium text-muted">Associated CCF controls</div>
                    {r.mappings.length === 0 ? (
                      <p className="text-xs text-warning">No authoritative CCF control maps to this requirement.</p>
                    ) : (
                      <ul className="space-y-1">
                        {r.mappings.map((m) => (
                          <li key={m.id} className="flex items-start gap-2 text-xs">
                            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                            <Link href={`/controls/${encodeURIComponent(m.control.controlName)}`} className="font-mono font-medium text-fg hover:text-accent">{m.control.controlName}</Link>
                            <span className="min-w-0 flex-1 truncate text-fg-2">{m.control.title}</span>
                            <Badge tone={m.mappingType === "PRIMARY" ? "accent" : "outline"}>{m.mappingType.toLowerCase()}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}
