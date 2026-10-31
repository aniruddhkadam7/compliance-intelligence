import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { EmptyState, KeyValue, Mono, Page, PageHeader, Provenance, StatStrip } from "@/components/common";
import { LongText } from "@/components/long-text";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRequirement } from "@/lib/queries/requirements";

export const dynamic = "force-dynamic";

export default async function RequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRequirement(id);
  if (!r) notFound();
  const primaryCount = r.authoritativeMappings.filter((m) => m.mappingType === "PRIMARY").length;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Internal CCF Mapping", href: "/controls" }, { label: `IR ${r.requirementId}` }]}
        title={<span>IR {r.requirementId} · {r.name}</span>}
        description={r.riskTopic ?? undefined}
        meta={
          <>
            <Badge tone="info">Integrated requirement</Badge>
            {r.foundInPrioritized ? <Badge tone="success">Found in prioritised sources</Badge> : <Badge tone="outline">Not in prioritised sources</Badge>}
            {r.class && <Badge tone="outline">{r.class}</Badge>}
          </>
        }
      />
      {r.reviews.length > 0 && primaryCount === 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>This requirement appears on the workbook&apos;s “Unmapped IRs” review sheets. Those analyses list <b>candidate</b> controls only. They are shown below and are not treated as mappings.</span>
        </div>
      )}
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "Citations", value: r.citationCount, sub: `${r.citationGroups.length} frameworks` },
          { label: "CCF controls (primary)", value: primaryCount, sub: `Workbook states ${r.statedCcfMappingCount ?? "—"}` },
          { label: "CCF controls (secondary)", value: r.authoritativeMappings.length - primaryCount },
          { label: "Review analyses", value: r.reviews.length, sub: "Unmapped IR sheets" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Requirement" />
            <CardBody className="space-y-4">
              <div><div className="mb-1 text-[11px] font-medium text-muted">Risk statement</div><LongText text={r.riskStatement} /></div>
              <div><div className="mb-1 text-[11px] font-medium text-muted">Control objective</div><LongText text={r.controlObjective} lines={4} /></div>
              <Provenance sheet={r.sourceSheet} row={r.sourceRow} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Citations by framework" description="Source sections linked to this requirement in “ArC Citations to Sources (Meta)”" />
            {r.citationGroups.length === 0 ? (
              <EmptyState title="No citations" description="This requirement is not cited by any of the 27 prioritised sources." />
            ) : (
              <div className="divide-y divide-border">
                {r.citationGroups.map((g) => (
                  <details key={g.framework.id} className="group" open={r.citationGroups.length <= 4}>
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 hover:bg-surface-2">
                      <Link href={`/frameworks/${g.framework.id}`} className="text-[13px] font-medium text-fg hover:text-accent">{g.framework.short}</Link>
                      <span className="text-xs text-muted tabular">{g.citations.length} citations</span>
                    </summary>
                    <ul className="border-t border-border bg-surface-2 py-1">
                      {g.citations.map((c) => (
                        <li key={c.id}>
                          <Link href={`/citations?citation=${c.sourceSectionId}`} className="flex gap-3 px-4 py-1.5 text-xs hover:bg-surface-3">
                            <Mono className="w-14 shrink-0 text-[11px]">{c.sourceSectionId}</Mono>
                            <span className="text-fg-2">{c.sectionName}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Mapped CCF controls" description="Authoritative sheet “CCFv2 (Metadata)”" icon={<ShieldCheck />} />
            {r.authoritativeMappings.length === 0 ? (
              <EmptyState title="No CCF control mapped" />
            ) : (
              <ul className="divide-y divide-border">
                {r.authoritativeMappings.map((m) => (
                  <li key={m.id}>
                    <Link href={`/controls/${encodeURIComponent(m.control.controlName)}`} className="block px-4 py-2 hover:bg-surface-2">
                      <div className="flex items-center gap-2"><Mono className="font-medium text-fg">{m.control.controlName}</Mono><Badge tone={m.mappingType === "PRIMARY" ? "accent" : "outline"}>{m.mappingType.toLowerCase()}</Badge></div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted">{m.control.title}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {r.workingMappings.length > 0 && (
            <Card>
              <CardHeader title="Working sheet values" description="“Metadata(CCFv2)”. Shown for comparison only" />
              <ul className="divide-y divide-border">
                {r.workingMappings.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                    <Mono>{m.control.controlName}</Mono><Badge tone="outline">{m.mappingType.toLowerCase()}</Badge>
                    {!r.authoritativeMappings.some((a) => a.control.id === m.control.id && a.mappingType === m.mappingType) && <Badge tone="warning">differs</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {r.reviews.map((rv) => (
            <Card key={rv.id}>
              <CardHeader title={rv.sheetName} description="Review analysis (candidate matches, not approved)" actions={<Provenance sheet={rv.sheetName} row={rv.sourceRow} />} />
              <CardBody>
                <KeyValue
                  cols={1}
                  items={Object.entries(rv.raw as Record<string, string | null>)
                    .filter(([k, v]) => v && !["IR ID", "Risk Topic", "Requirement Name", "Risk Statement", "Risk Objective"].includes(k) && !k.startsWith("(unlabelled"))
                    .map(([k, v]) => ({ label: k, value: <LongText text={v} lines={4} /> }))}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
