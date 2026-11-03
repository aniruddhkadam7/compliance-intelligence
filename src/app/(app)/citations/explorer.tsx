"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CitationTable, useCitations } from "@/components/citations/citation-table";
import { CitationDetailSheet } from "@/components/citations/citation-detail";
import { apiGet } from "@/lib/client/api";
import { useDebounced, useUrlState } from "@/lib/client/hooks";
import { CITATION_DEFAULTS } from "@/lib/client/prefetch";
import { formatNumber } from "@/lib/utils";
import { TERMS } from "@/lib/terms";

interface Facets {
  frameworks: { id: string; name: string; short: string; citations: number; family: string | null; version: string | null }[];
  families: { family: string; versions: { id: string; version: string | null }[] }[];
}

const FIELDS = [
  { value: "all", label: "All fields" },
  { value: "sectionId", label: "Source ID" },
  { value: "sectionName", label: "Requirement description" },
  { value: "text", label: "Full requirement text" },
];

export function CitationExplorer() {
  const [s, set] = useUrlState(CITATION_DEFAULTS);
  const [q, setQ] = useState(s.q);
  const dq = useDebounced(q, 300);
  useEffect(() => {
    if (dq !== s.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { data: facets } = useQuery({ queryKey: ["citation-facets"], queryFn: () => apiGet<Facets>("/api/citations?view=facets") });
  const family = facets?.families.find((f) => f.family === s.family);
  const query = { ...s, page: Number(s.page) || 1, citation: undefined };
  const { data } = useCitations(query);
  const active = [s.q, s.frameworkId, s.family, s.mapped].some(Boolean);

  return (
    <Page>
      <PageHeader
        title={TERMS.obligations}
        description="Every regulatory and legal requirement in the global document library, identified by its unique Source ID. Independent of any client data."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Source ID or requirement description…" className="pl-8" aria-label="Search obligations" />
          </div>
          <Select value={s.field} onChange={(v) => set({ field: v })} options={FIELDS} aria-label="Search field" />
          <Select
            value={s.frameworkId} onChange={(v) => set({ frameworkId: v, family: "", version: "" })} allLabel="All frameworks" placeholder="Framework"
            options={(facets?.frameworks ?? []).map((f) => ({ value: f.id, label: f.short, hint: formatNumber(f.citations) }))}
            triggerClassName="min-w-[200px]" aria-label="Framework"
          />
          <Select
            value={s.family} onChange={(v) => set({ family: v, version: "", frameworkId: "" })} allLabel="Any family" placeholder="Framework family"
            options={(facets?.families ?? []).map((f) => ({ value: f.family, label: f.family, hint: `${f.versions.length} versions` }))}
            aria-label="Framework family"
          />
          {family && (
            <Select
              value={s.version} onChange={(v) => set({ version: v })} allLabel="All versions"
              options={family.versions.map((v) => ({ value: v.version ?? "", label: `Version ${v.version}` }))} aria-label="Framework version"
            />
          )}
          {active && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: "", frameworkId: "", family: "", version: "", mapped: "" }); }}>
              <X /> Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted">
          <span className="tabular">{data ? `${formatNumber(data.total)} obligations` : "…"}</span>
        </div>
        <CitationTable
          query={query}
          onPage={(p) => set({ page: String(p) })}
          onSort={(x) => set({ sort: x?.id ?? "", dir: x?.desc ? "desc" : "asc" })}
          onOpen={(id) => set({ citation: id, page: s.page })}
          selectedId={s.citation}
        />
      </Card>
      <CitationDetailSheet citationId={s.citation || null} onClose={() => set({ citation: "", page: s.page })} onOpen={(id) => set({ citation: id, page: s.page })} />
    </Page>
  );
}
