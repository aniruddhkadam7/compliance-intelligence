"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, ExternalLink, FileText, Search, ShieldAlert, UserCheck } from "lucide-react";
import { EmptyState, KeyValue, Page, PageHeader, SectionTitle } from "@/components/common";
import { LongText } from "@/components/long-text";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlState } from "@/lib/client/hooks";
import { cn, formatDate, formatNumber, formatRelative } from "@/lib/utils";

export interface SourceDoc {
  id: string; name: string; short: string; publisher: string; type: string | null; group: string | null;
  jurisdiction: string | null; licensing: string | null; description: string | null; documentUrl: string | null;
  version: string | null; obligations: number; lastUpdated: string | null; monitored: boolean; lastChecked: string | null;
  otherVersions: { id: string; short: string; version: string | null }[];
  detectedChanges: {
    id: string; changeType: string; title: string; summary: string; previousValue: string | null; newValue: string | null;
    reviewStatus: string; detectedAt: string; connector: string;
  }[];
}

const CHANGE_LABEL: Record<string, string> = {
  VERSION_CHANGE: "Version change",
  CONTENT_CHANGE: "Content change",
  NEW_PUBLICATION: "New publication",
  NEW_INFORMATIVE_REFERENCE: "New informative reference",
};

export function SourcesView({ docs }: { docs: SourceDoc[] }) {
  const [s, set] = useUrlState({ doc: "" });
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => docs.filter((d) => !q || `${d.name} ${d.publisher} ${d.type ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [docs, q],
  );
  const groups = useMemo(() => {
    const m = new Map<string, SourceDoc[]>();
    filtered.forEach((d) => m.set(d.publisher, [...(m.get(d.publisher) ?? []), d]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);
  // Default selection: a document with a detected change, otherwise the first one.
  const selected = docs.find((d) => d.id === s.doc) ?? docs.find((d) => d.detectedChanges.length) ?? docs[0];

  if (!docs.length)
    return (
      <Page>
        <PageHeader title="Sources" />
        <Card><EmptyState title="No authoritative documents loaded" description="Load the document library from Data & Imports." /></Card>
      </Page>
    );

  return (
    <Page>
      <PageHeader
        title="Sources"
        description="The authoritative documents behind the platform: what each one is, its current version, and what changed from the previous version."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="pl-8" aria-label="Search documents" />
            </div>
          </div>
          <div className="scrollbar-thin max-h-[calc(100dvh-220px)] overflow-y-auto p-2">
            {groups.map(([pub, items]) => (
              <div key={pub} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">{pub} · {items.length}</div>
                {items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => set({ doc: d.id })}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                      selected?.id === d.id ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-surface-3",
                    )}
                  >
                    <span className="truncate">{d.short}</span>
                    {d.detectedChanges.some((c) => c.reviewStatus === "NEW") && <Badge tone="warning">Update</Badge>}
                  </button>
                ))}
              </div>
            ))}
            {!filtered.length && <p className="px-2 py-4 text-xs text-muted">No documents match.</p>}
          </div>
        </Card>

        {selected && <SourceDetail d={selected} />}
      </div>
    </Page>
  );
}

function SourceDetail({ d }: { d: SourceDoc }) {
  const latestVersionChange = d.detectedChanges.find((c) => c.changeType === "VERSION_CHANGE");
  const others = d.detectedChanges.filter((c) => c.id !== latestVersionChange?.id);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<span className="text-[15px]">{d.short}</span>}
          description={d.name}
          icon={<FileText />}
          actions={d.documentUrl ? (
            <Button asChild size="sm"><a href={d.documentUrl} target="_blank" rel="noopener noreferrer">Official source <ExternalLink /></a></Button>
          ) : null}
        />
        <CardBody className="space-y-4">
          <KeyValue
            cols={3}
            items={[
              { label: "Type", value: d.type },
              { label: "Industry / group", value: d.group },
              { label: "Jurisdiction", value: d.jurisdiction },
              { label: "Current version", value: d.version },
              { label: "Last updated", value: d.lastUpdated ? formatDate(d.lastUpdated) : null, hint: "Publication date reported by the official source, where monitored" },
              { label: "Obligations", value: formatNumber(d.obligations) },
            ]}
          />
          {d.description && <LongText text={d.description} lines={3} />}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {d.monitored ? <Badge tone="info">Monitored for updates</Badge> : <Badge tone="outline">Not yet monitored</Badge>}
            {d.lastChecked && <span>Last checked {formatRelative(d.lastChecked)}</span>}
            {d.otherVersions.length > 0 && (
              <span>Other versions in library: {d.otherVersions.map((v) => <Link key={v.id} href={`/sources?doc=${v.id}`} className="ml-1 text-accent hover:underline">{v.short}</Link>)}</span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* AI change review: shown when monitoring has detected a change for this document. */}
      {latestVersionChange && (
        <Card className="border-warning/40">
          <CardHeader
            title="Version update detected"
            icon={<Bot />}
            description={`${latestVersionChange.previousValue ?? "Previous"} → ${latestVersionChange.newValue ?? "latest"} · detected ${formatRelative(latestVersionChange.detectedAt)}`}
            actions={latestVersionChange.reviewStatus === "NEW" ? <Badge tone="warning"><UserCheck /> Human approval needed</Badge> : <Badge tone="success">Reviewed</Badge>}
          />
          <CardBody className="space-y-3">
            <p className="text-[13px] text-fg-2">{latestVersionChange.summary}</p>
            <div className="rounded-md border border-dashed border-border-strong bg-surface-2 p-3">
              <SectionTitle>AI change analysis</SectionTitle>
              <p className="text-[13px] text-muted">Placeholder: summary of new, changed and removed sections between the two versions, and where human review is required. Content to follow.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="primary"><Link href={`/updates?update=${latestVersionChange.id}`}><ShieldAlert /> Review and approve</Link></Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Major changes from the previous version" description={d.otherVersions.length ? `Compared with ${d.otherVersions.map((v) => v.short).join(", ")}` : "Previous version"} />
        <CardBody>
          <div className="rounded-md border border-dashed border-border-strong bg-surface-2 p-4">
            <p className="text-[13px] text-muted">Placeholder: the major changes between the previous version and {d.short}, such as new sections, revised requirements, retired content and scope changes. Content to follow.</p>
          </div>
        </CardBody>
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader title="Other detected updates" description="From official source monitoring" />
          <ul className="divide-y divide-border">
            {others.map((c) => (
              <li key={c.id}>
                <Link href={`/updates?update=${c.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2">
                  <Badge tone="accent" className="mt-0.5">{CHANGE_LABEL[c.changeType] ?? c.changeType}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-fg">{c.title}</div>
                    <div className="text-[11px] text-muted">{c.connector} · {formatRelative(c.detectedAt)}</div>
                  </div>
                  {c.reviewStatus === "NEW" && <Badge tone="warning">To review</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
