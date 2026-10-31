import Link from "next/link";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, DatabaseZap, FileWarning, Info, Library, ListTree, Quote, RadioTower, ShieldCheck,
} from "lucide-react";
import { Page, PageHeader, StatStrip, EmptyState } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarList, CoverageBars, Meter, RankedBars } from "@/components/charts";
import { getDashboard } from "@/lib/queries/dashboard";
import { ISSUE_LABELS } from "@/lib/labels";
import { formatDateTime, formatNumber, formatPercent, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const d = await getDashboard();
  const t = d.totals;

  if (t.frameworks === 0) {
    return (
      <Page>
        <PageHeader title="Overview" description="Executive view of the compliance knowledge base." />
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="No workbook imported yet"
            description="Import the CCF demonstration workbook to populate frameworks, citations, integrated requirements and CCF controls."
            action={<Button asChild variant="primary"><Link href="/data">Go to Data & Imports</Link></Button>}
          />
        </Card>
      </Page>
    );
  }

  const coverage = t.prioritized ? t.mappedPrioritized / t.prioritized : 0;
  const coverageRows = d.perFramework
    .filter((f) => f.requirements > 0)
    .map((f) => ({ id: f.id, short: f.short, mapped: f.mappedRequirements, unmapped: f.requirements - f.mappedRequirements, total: f.requirements }))
    .sort((a, b) => b.total - a.total);
  const errors = d.dataQuality.filter((q) => q.severity === "ERROR").reduce((n, q) => n + q.count, 0);
  const warnings = d.dataQuality.filter((q) => q.severity === "WARNING").reduce((n, q) => n + q.count, 0);

  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Every figure on this page is calculated from the imported workbook and connector history."
        meta={
          <>
            {d.lastImport && (
              <Badge tone="outline"><DatabaseZap /> {d.lastImport.fileName} · imported {formatRelative(d.lastImport.completedAt)}</Badge>
            )}
            <Badge tone="outline"><Clock /> Last sync {d.lastSync ? `${formatRelative(d.lastSync)} (${d.lastSyncConnector})` : "not run yet"}</Badge>
          </>
        }
      />

      <StatStrip
        className="mb-4"
        items={[
          { label: "Frameworks", value: t.frameworks, sub: "ArC authoritative sources", href: "/frameworks", icon: Library },
          { label: "Citations", value: t.citations, sub: "Source sections", href: "/citations", icon: Quote },
          { label: "CCF controls", value: t.controls, sub: `${formatNumber(t.controlsMapped)} linked to an IR`, href: "/controls", icon: ShieldCheck },
          { label: "Integrated requirements", value: t.requirements, sub: `${formatNumber(t.prioritized)} in prioritised sources`, icon: ListTree },
          {
            label: "Mapping coverage", value: formatPercent(coverage), tone: "accent", sub: `${t.mappedPrioritized} of ${t.prioritized} prioritised IRs`,
            hint: "Prioritised IRs that are the primary ArC mapping of at least one CCF control (authoritative sheet), divided by all prioritised IRs. Matches the workbook's “Count in CCF v2 Mapping?”.",
          },
          {
            label: "Unmapped requirements", value: t.unmappedPrioritized, tone: t.unmappedPrioritized ? "warning" : "success", sub: "Prioritised IRs without a control",
            href: "/mappings?tab=unmapped", hint: "Prioritised IRs with no authoritative CCF mapping. These match the workbook's “Unmapped IRs” review sheets.",
          },
          { label: "Updates to review", value: t.newUpdates, tone: t.newUpdates ? "warning" : "default", sub: "Detected by connectors", href: "/updates", icon: RadioTower },
          { label: "Last synchronisation", value: <span className="text-[15px]">{d.lastSync ? formatRelative(d.lastSync) : "—"}</span>, sub: d.lastSync ? formatDateTime(d.lastSync) : "No connector has run", href: "/updates" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Citations by framework" description="Number of source sections per authoritative source. Select a label to open the framework." />
          <CardBody className="pt-3">
            <RankedBars data={d.perFramework.map((f) => ({ ...f, href: `/frameworks/${f.id}` }))} valueKey="citations" labelKey="short" valueLabel="Citations" hrefKey="href" />
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Mapping coverage" description="Prioritised integrated requirements traced to a CCF control" />
            <CardBody>
              <Meter value={t.mappedPrioritized} total={t.prioritized} label="Primary “ARC Mapping” values on the authoritative “CCFv2 (Metadata)” sheet" />
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs">
                <div><div className="text-muted">Unmapped</div><div className="mt-0.5 text-[15px] font-semibold tabular text-warning">{t.unmappedPrioritized}</div></div>
                <div><div className="text-muted">of which secondary only</div><div className="mt-0.5 text-[15px] font-semibold tabular">{t.secondaryOnlyPrioritized}</div></div>
                <div><div className="text-muted">IRs outside prioritised sources</div><div className="mt-0.5 text-[15px] font-semibold tabular">{t.notInPrioritized}</div></div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Framework distribution" description="Authoritative sources by type and jurisdiction" />
            <CardBody className="space-y-4">
              <BarList items={d.byType.map((x) => ({ label: x.label, count: x.count, href: `/frameworks?type=${encodeURIComponent(x.label)}` }))} />
              <div className="border-t border-border pt-3">
                <BarList items={d.byJurisdiction.map((x) => ({ label: x.label, count: x.count, href: `/frameworks?jurisdiction=${encodeURIComponent(x.label)}` }))} />
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Requirement coverage by framework"
            description="For each source: the integrated requirements its citations map to, split by whether a CCF control is mapped to that requirement."
          />
          <CardBody className="pt-3"><CoverageBars data={coverageRows} /></CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Data quality"
            description="Findings from the last workbook import"
            icon={<FileWarning />}
            actions={<Button asChild size="sm" variant="ghost"><Link href="/data?tab=quality">View all</Link></Button>}
          />
          <CardBody className="p-0">
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
              <div className="py-2.5"><div className="text-[17px] font-semibold tabular text-danger">{errors}</div><div className="text-[11px] text-muted">Errors</div></div>
              <div className="py-2.5"><div className="text-[17px] font-semibold tabular text-warning">{warnings}</div><div className="text-[11px] text-muted">Warnings</div></div>
              <div className="py-2.5"><div className="text-[17px] font-semibold tabular">{d.dataQuality.filter((q) => q.severity === "INFO").reduce((n, q) => n + q.count, 0)}</div><div className="text-[11px] text-muted">Notices</div></div>
            </div>
            <ul className="divide-y divide-border">
              {d.dataQuality.slice(0, 7).map((q) => {
                const Icon = q.severity === "ERROR" ? AlertTriangle : q.severity === "WARNING" ? AlertTriangle : q.code === "CHECK_PASSED" ? CheckCircle2 : Info;
                const tone = q.severity === "ERROR" ? "text-danger" : q.severity === "WARNING" ? "text-warning" : q.code === "CHECK_PASSED" ? "text-success" : "text-muted";
                return (
                  <li key={q.code + q.severity}>
                    <Link href={`/data?tab=quality&code=${q.code}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-2">
                      <Icon className={`size-3.5 shrink-0 ${tone}`} />
                      <span className="flex-1 truncate text-[13px] text-fg-2">{ISSUE_LABELS[q.code] ?? q.code}</span>
                      <span className="text-xs text-muted tabular">{q.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Recent framework updates" icon={<RadioTower />} actions={<Button asChild size="sm" variant="ghost"><Link href="/updates">Update centre</Link></Button>} />
          {d.recentUpdates.length === 0 ? (
            <EmptyState icon={RadioTower} title="No updates detected yet" description="Run a connector check from Updates & Connectors to establish a baseline and detect changes." />
          ) : (
            <ul className="divide-y divide-border">
              {d.recentUpdates.map((u) => (
                <li key={u.id}>
                  <Link href={`/updates?update=${u.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <Badge tone={u.reviewStatus === "NEW" ? "warning" : "neutral"} className="mt-0.5">{u.reviewStatus === "NEW" ? "New" : u.reviewStatus.toLowerCase()}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-fg">{u.title}</div>
                      <div className="text-[11px] text-muted">{u.connector.name} · {u.changeType.replace(/_/g, " ").toLowerCase()}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-subtle">{formatRelative(u.detectedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent mapping activity" description="Imports and review actions (audit log)" icon={<Activity />} />
          {d.recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-border">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="px-4 py-2">
                  <div className="text-[13px] text-fg-2">{(ACTION_LABELS[a.action] ?? a.action.replace(/_/g, " ").toLowerCase())}</div>
                  <div className="text-[11px] text-muted">{a.actor} · {formatRelative(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}

const ACTION_LABELS: Record<string, string> = {
  IMPORT_COMPLETED: "CCF workbook imported",
  IMPORT_REJECTED: "Workbook import rejected (validation errors)",
  IMPORT_PREVIEWED: "Workbook previewed",
  TRANSITION_IMPORTED: "Version transition workbook imported",
  CONNECTOR_SYNC: "Connector baseline synchronised",
  DATA_RESET: "Uploaded data reset",
  UPDATE_REVIEWED: "Framework update reviewed",
};
