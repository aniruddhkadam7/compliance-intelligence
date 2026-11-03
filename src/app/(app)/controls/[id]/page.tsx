import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, GitCompareArrows } from "lucide-react";
import { Page, PageHeader } from "@/components/common";
import { getControl } from "@/lib/queries/controls";
import { ControlTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function ControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getControl(decodeURIComponent(id));
  if (!c) notFound();

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Internal CCF Mapping", href: "/controls" }, { label: c.controlName }]}
        title={<span className="flex items-center gap-2"><span className="font-mono">{c.controlName}</span></span>}
        description={c.title ?? undefined}
      />
      {c.review && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-fg">
          <GitCompareArrows className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Framework version change: {c.review.label}.</span> {c.review.count} proposed mapping change{c.review.count === 1 ? "" : "s"} await review.
            The test procedures are unchanged; only the framework mapping and citations differ.{" "}
            <Link href={`/change-analytics?update=${c.review.updateId}&control=${encodeURIComponent(c.controlName)}`} className="font-medium text-accent hover:underline">Review in Change Analytics</Link>
          </div>
        </div>
      )}
      {c.conflict && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Mapping differs between worksheets.</span> The two control sheets in the uploaded workbook disagree on this control&apos;s mapping.
            The authoritative sheet&apos;s value is used everywhere, and neither value has been changed.
          </div>
        </div>
      )}
      <ControlTabs control={JSON.parse(JSON.stringify(c))} />
    </Page>
  );
}
