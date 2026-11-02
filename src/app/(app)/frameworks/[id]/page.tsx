import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, GitCompareArrows } from "lucide-react";
import { KeyValue, Mono, Page, PageHeader, Provenance, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarList } from "@/components/charts";
import { LongText } from "@/components/long-text";
import { getFramework } from "@/lib/queries/frameworks";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/utils";
import { FrameworkTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function FrameworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fw = await getFramework(id);
  if (!fw) notFound();
  const otherVersions = fw.versions.filter((v) => v.id !== fw.id);

  const overview = (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader title="Framework overview" />
          <CardBody className="space-y-4">
            <LongText text={fw.description} lines={5} />
            <KeyValue
              cols={3}
              items={[
                { label: "Framework ID", value: <Mono>{fw.sourceId}</Mono> },
                { label: "Publisher / group", value: fw.group },
                { label: "Category", value: fw.type },
                { label: "Jurisdiction", value: fw.jurisdiction },
                { label: "Licensing", value: fw.licensing },
                { label: "Version", value: fw.versionLabel, hint: "Derived from the framework name" },
                { label: "Publication date", value: <span className="text-subtle">Not in workbook</span> },
                { label: "Last updated (import)", value: formatDateTime(fw.updatedAt) },
              ]}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Provenance sheet={fw.sourceSheet} row={fw.sourceRow} />
              {fw.documentUrl && (
                <a href={fw.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  Official document <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Source sections" description="Top-level sections parsed from “Source Section Name” (first level after the source title)" />
          <CardBody>
            <BarList items={fw.sections.slice(0, 18).map((s) => ({ label: s.section, count: s.citations, href: `/frameworks/${fw.id}?tab=citations&q=${encodeURIComponent(s.section)}` }))} />
            {fw.sections.length > 18 && <p className="mt-3 text-[11px] text-muted">Showing 18 of {fw.sections.length} sections.</p>}
          </CardBody>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Available versions" description={fw.family ? `Sources in the “${fw.family}” family` : undefined} />
          <ul className="divide-y divide-border">
            {fw.versions.length <= 1 && <li className="px-4 py-3 text-xs text-muted">Only one version of this framework is in the workbook.</li>}
            {fw.versions.length > 1 &&
              fw.versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/frameworks/${v.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-surface-2">
                    <span className="text-[13px] text-fg">{v.short}</span>
                    <span className="flex items-center gap-2">
                      {v.id === fw.id && <Badge tone="accent">Current</Badge>}
                      <span className="text-xs text-muted tabular">{formatNumber(v.citations)} obligations</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
          {otherVersions.length > 0 && (
            <div className="border-t border-border p-3">
              <Button asChild size="sm" className="w-full">
                <Link href={`/version-impact?from=${fw.versions[0].id}&to=${fw.versions[fw.versions.length - 1].id}`}><GitCompareArrows /> Compare versions</Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Framework Repository", href: "/frameworks" }, { label: fw.short }]}
        title={fw.short}
        description={fw.name}
        meta={
          <>
            {fw.type && <Badge>{fw.type}</Badge>}
            {fw.jurisdiction && <Badge tone="outline">{fw.jurisdiction}</Badge>}
            {fw.connectors.length > 0 && <Badge tone="info">Monitored by {fw.connectors.length} connector{fw.connectors.length > 1 ? "s" : ""}</Badge>}
          </>
        }
      />
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "Regulatory obligations", value: fw._count.citations, sub: "Requirements in this framework" },
          { label: "Mapping coverage", value: formatPercent(fw._count.citations ? fw.totals.mapped / fw._count.citations : 0), tone: "accent", sub: `${formatNumber(fw.totals.mapped)} obligations with a CCF control` },
          { label: "Unmapped obligations", value: fw._count.citations - fw.totals.mapped, tone: "warning", sub: "No CCF control mapped" },
          { label: "Mapped CCF controls", value: fw.totals.controls, sub: "Controls linked to this framework" },
        ]}
      />
      <FrameworkTabs frameworkId={fw.id} overview={overview} />
    </Page>
  );
}
