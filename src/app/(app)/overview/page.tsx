import Link from "next/link";
import { DatabaseZap, Info } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/common";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { prisma } from "@/lib/db";
import { publisherOf as publisher } from "@/lib/queries/sources";
import { TERMS } from "@/lib/terms";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.overview };

const count = (items: string[]) =>
  [...items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

// Placeholder tiles until the overview content is finalised.
const PLACEHOLDER_TILES = ["xx", "yy", "zz", "xx", "yy", "zz"];

export default async function OverviewPage() {
  const docs = await prisma.framework.findMany({ select: { name: true, type: true } });

  if (docs.length === 0) {
    return (
      <Page>
        <PageHeader title={TERMS.overview} />
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="No authoritative documents loaded"
            description="Load the document library to populate the platform."
            action={<Button asChild variant="primary"><Link href="/data">Go to Data & Imports</Link></Button>}
          />
        </Card>
      </Page>
    );
  }

  const byPublisher = count(docs.map((d) => publisher(d.name)));
  const byType = count(docs.map((d) => d.type ?? "Unspecified"));

  return (
    <Page>
      <PageHeader title={TERMS.overview} />

      <Card className="mb-5 border-dashed">
        <CardBody className="flex items-start gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" />
          <div>
            <div className="text-[13px] font-semibold text-fg">About this platform</div>
            <p className="mt-1 text-[13px] text-muted">Placeholder: what this tool is and how it adds value. Content to follow.</p>
          </div>
        </CardBody>
      </Card>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Tooltip
          side="bottom"
          className="max-w-sm bg-surface p-3 text-fg shadow-pop ring-1 ring-border"
          content={
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 font-semibold">By publisher</div>
                {byPublisher.map(([k, n]) => <div key={k} className="flex justify-between gap-6"><span className="text-fg-2">{k}</span><span className="tabular">{n}</span></div>)}
              </div>
              <div>
                <div className="mb-1 font-semibold">By type</div>
                {byType.map(([k, n]) => <div key={k} className="flex justify-between gap-6"><span className="text-fg-2">{k}</span><span className="tabular">{n}</span></div>)}
              </div>
            </div>
          }
        >
          <Link href="/sources" className="block rounded-lg border border-border bg-surface p-5 shadow-xs transition-colors hover:border-accent">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">{TERMS.authoritativeDocuments}</div>
            <div className="mt-1 text-[56px] font-semibold leading-none tracking-tight tabular text-fg">{docs.length}</div>
            <div className="mt-2 text-xs text-subtle">Hover for the breakdown · select to open Sources</div>
          </Link>
        </Tooltip>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLACEHOLDER_TILES.map((v, i) => (
            <div key={i} className="rounded-lg border border-dashed border-border-strong bg-surface p-4">
              <div className="text-[11px] font-medium text-subtle">Placeholder metric</div>
              <div className="mt-1 text-[22px] font-semibold tracking-tight text-muted">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
