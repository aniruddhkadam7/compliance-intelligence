import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, BellRing, CheckCircle2 } from "lucide-react";
import { TERMS } from "@/lib/terms";
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
        breadcrumbs={[{ label: TERMS.clientControls, href: "/controls" }, { label: c.controlName }]}
        title={<span className="flex items-center gap-2"><span className="font-mono">{c.controlName}</span></span>}
        description={c.title ?? undefined}
      />
      {c.frameworkUpdates.map((u) => u.state === "pending" ? (
        <div key={u.key} className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] text-fg">
          <BellRing className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Newer version: {u.family} {u.previous} → {u.current}.</span> This control still points to {u.family} {u.previous} (highlighted in yellow) until its mapping is approved.{" "}
            <Link href={`/change-analytics?update=${u.key}&control=${encodeURIComponent(c.controlName)}`} className="font-medium text-fg underline underline-offset-2">Review and approve in {TERMS.versionImpact}</Link>
          </div>
        </div>
      ) : (
        <div key={u.key} className="mb-4 flex items-start gap-2.5 rounded-md border border-success/40 bg-success-soft px-3 py-2.5 text-[13px] text-fg">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <div><span className="font-medium">Newer version: {u.family} {u.previous} → {u.current}.</span> Mapping approved; this control now points to {u.family} {u.current} (highlighted in green).</div>
        </div>
      ))}
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
