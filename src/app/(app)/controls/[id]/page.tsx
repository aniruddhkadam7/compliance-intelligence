import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Page, PageHeader, StatStrip } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { getControl } from "@/lib/queries/controls";
import { ControlTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function ControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getControl(decodeURIComponent(id));
  if (!c) notFound();
  const obligations = new Set(c.trace.flatMap((f) => f.citations.map((o) => o.id))).size;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Internal CCF Mapping", href: "/controls" }, { label: c.controlName }]}
        title={<span className="flex items-center gap-2"><span className="font-mono">{c.controlName}</span></span>}
        description={c.title ?? undefined}
        meta={
          <>
            {c.category && <Badge>{c.category}</Badge>}
            {c.subCategory && <Badge tone="outline">{c.subCategory}</Badge>}
            {c.scope && <Badge tone="info">{c.scope}</Badge>}
            {c.technicalType && <Badge tone="outline">{c.technicalType}</Badge>}
            {c.gskReviewStatus && <Badge tone={c.gskReviewStatus === "GSK approved" ? "success" : "neutral"}>{c.gskReviewStatus}</Badge>}
          </>
        }
      />
      {c.conflict && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Mapping differs between worksheets.</span> The two control sheets in the uploaded workbook disagree on this control&apos;s mapping.
            The authoritative sheet&apos;s value is used everywhere, and neither value has been changed.
          </div>
        </div>
      )}
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "Mapped obligations", value: obligations, sub: "Regulatory obligations linked to this control" },
          { label: "Frameworks reached", value: c.trace.length, sub: "Distinct frameworks" },
          { label: "Test procedures", value: c.testProcedures.length, sub: "Across workbook columns" },
          { label: "Evidence statements", value: c.evidence.length, sub: "Across workbook columns" },
        ]}
      />
      <ControlTabs control={JSON.parse(JSON.stringify(c))} />
    </Page>
  );
}
