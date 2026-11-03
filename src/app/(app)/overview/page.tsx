import Link from "next/link";
import { ArrowRight, DatabaseZap, Info, Radar } from "lucide-react";
import { EmptyState, Page, PageHeader, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { prisma } from "@/lib/db";
import { publisherOf as publisher } from "@/lib/queries/sources";
import { applicabilityOf } from "@/lib/sources/applicability";
import { UPDATE_CHECK } from "@/lib/updates/labels";
import { shortName } from "@/lib/frameworks";
import { TERMS } from "@/lib/terms";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.overview };

const count = (items: string[]) =>
  [...items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

/** Framework Catalog: global intelligence only. No client, control or obligation metrics. */
export default async function OverviewPage() {
  const [docs, checks, approved, awaiting] = await Promise.all([
    prisma.framework.findMany({ select: { id: true, name: true, type: true, jurisdiction: true, family: true, applicability: true } }),
    // Latest "Check for Updates" result per document (evidence-backed; failures are not counted as up to date).
    prisma.updateCheck.findMany({ orderBy: { checkedAt: "desc" }, select: { frameworkId: true, status: true, latestVersion: true, message: true, checkedAt: true } }),
    prisma.aiIngestion.count({ where: { status: "PUBLISHED" } }),
    prisma.aiIngestion.count({ where: { status: "READY" } }),
  ]);

  if (docs.length === 0) {
    return (
      <Page>
        <PageHeader title={TERMS.overview} description="Framework Catalog" />
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="No authoritative documents loaded"
            description="Load the document library to populate the platform."
            action={<Button asChild variant="primary"><Link href="/data">Go to {TERMS.data}</Link></Button>}
          />
        </Card>
      </Page>
    );
  }

  const byPublisher = count(docs.map((d) => publisher(d.name)));
  const byType = count(docs.map((d) => d.type ?? "Unspecified"));
  const byJurisdiction = count(docs.map((d) => d.jurisdiction ?? "Unspecified"));
  const applicability = docs.map((d) => applicabilityOf(d));
  const byApplicability = count(applicability.flatMap((a) => (a.tags.length ? a.tags.map((t) => (a.basis === "TITLE" ? `${t}*` : t)) : ["Not classified"])));
  const families = count(docs.map((d) => d.family ?? d.name)).filter(([, n]) => n > 1);
  const latest = [...checks.reduce((m, c) => (m.has(c.frameworkId) ? m : m.set(c.frameworkId, c)), new Map<string, (typeof checks)[number]>()).values()];
  const available = latest.filter((c) => c.status === "UPDATE_AVAILABLE");
  const nameOf = new Map(docs.map((d) => [d.id, shortName(d.name)]));
  const activity = [...latest].sort((a, b) => (a.status === "UPDATE_AVAILABLE" ? -1 : 0) - (b.status === "UPDATE_AVAILABLE" ? -1 : 0) || b.checkedAt.getTime() - a.checkedAt.getTime()).slice(0, 6);

  return (
    <Page>
      <PageHeader title={TERMS.overview} description="Framework Catalog: the global library of authoritative documents, independent of any client." />

      <Card className="mb-5 border-dashed">
        <CardBody className="flex items-start gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" />
          <div>
            <div className="text-[13px] font-semibold text-fg">About this platform</div>
            <p className="mt-1 text-[13px] text-muted">
              <Badge tone="outline" className="mr-1.5">Placeholder</Badge>
              What the platform does, the intelligence it provides, how it adds value to clients and how authoritative document monitoring works. Content to follow from the stakeholder team.
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
        <Tooltip
          side="bottom"
          className="max-w-sm bg-surface p-3 text-fg shadow-pop ring-1 ring-border"
          content={
            <div className="space-y-1 text-xs">
              <div className="mb-1 font-semibold">By document type</div>
              {byType.map(([k, n]) => <div key={k} className="flex justify-between gap-6"><span className="text-fg-2">{k}</span><span className="tabular">{n}</span></div>)}
            </div>
          }
        >
          <Link href="/sources" className="block rounded-lg border border-border bg-surface p-5 shadow-xs transition-colors hover:border-accent">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">{TERMS.authoritativeDocuments}</div>
            <div className="mt-1 text-[56px] font-semibold leading-none tracking-tight tabular text-fg">{docs.length}</div>
            <div className="mt-2 text-xs text-subtle">Hover for the breakdown · select to open the {TERMS.sourceIndex}</div>
          </Link>
        </Tooltip>

        <StatStrip
          className="h-full sm:grid-cols-3 xl:grid-cols-3"
          items={[
            { label: "Publishers", value: byPublisher.length, sub: byPublisher.slice(0, 3).map(([k]) => k).join(", ") },
            { label: "Laws and regulations", value: docs.filter((d) => d.type === "Law or Regulation").length, sub: "Document type “Law or Regulation”" },
            { label: "Jurisdictions", value: byJurisdiction.filter(([k]) => k !== "Unspecified").length, sub: byJurisdiction.slice(0, 3).map(([k]) => k).join(", ") },
            { label: "Updates available", value: available.length, tone: available.length ? "warning" : "default", sub: `${latest.length} of ${docs.length} documents checked`, href: "/sources?status=UPDATE_AVAILABLE" },
            { label: "Versions tracked", value: families.length, sub: families.map(([k]) => k).join(", ") || "One version per document", hint: "Document families with more than one version loaded" },
            { label: "Approved version updates", value: approved, sub: awaiting ? `${awaiting} uploaded version(s) awaiting review` : "None awaiting review", href: "/change-analytics" },
          ]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Breakdown title="By document type" rows={byType} total={docs.length} />
        <Breakdown title="By publisher" rows={byPublisher} total={docs.length} />
        <Breakdown title="By jurisdiction" rows={byJurisdiction} total={docs.length} />
        <Breakdown title="By applicability" rows={byApplicability} total={docs.length} note="* derived from the document title until supplied" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Latest verified update activity" description="Results of Check for Updates against official publisher sources" icon={<Radar />} actions={<Button asChild size="sm" variant="ghost"><Link href="/sources">All sources <ArrowRight /></Link></Button>} />
        {activity.length ? (
          <ul className="divide-y divide-border">
            {activity.map((c) => (
              <li key={c.frameworkId} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Link href={`/sources/${c.frameworkId}`} className="min-w-0 flex-1 truncate text-fg hover:text-accent">{nameOf.get(c.frameworkId)}{c.latestVersion ? `: ${c.latestVersion}` : ""}</Link>
                <span className="whitespace-nowrap text-xs text-muted">{formatDate(c.checkedAt)}</span>
                <Badge tone={UPDATE_CHECK[c.status]?.tone ?? "neutral"}>{UPDATE_CHECK[c.status]?.label ?? c.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-xs text-muted">No update checks yet. Use Check for Updates in {TERMS.sources}.</p>
        )}
      </Card>
    </Page>
  );
}

function Breakdown({ title, rows, total, note }: { title: string; rows: [string, number][]; total: number; note?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="mb-3 text-[13px] font-semibold text-fg">{title}</div>
        <div className="space-y-2">
          {rows.map(([k, n]) => (
            <div key={k} className="grid grid-cols-[minmax(0,120px)_1fr_24px] items-center gap-3 text-xs">
              <span className="truncate text-fg-2" title={k}>{k}</span>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(n / total) * 100}%` }} />
              </div>
              <span className="text-right tabular text-fg">{n}</span>
            </div>
          ))}
        </div>
        {note && <p className="mt-2 text-[11px] text-subtle">{note}</p>}
      </CardBody>
    </Card>
  );
}
