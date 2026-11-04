import Link from "next/link";
import { ArrowRight, DatabaseZap, Gauge, Layers, RefreshCcw, type LucideIcon } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { publisherOf } from "@/lib/queries/sources";
import { TERMS } from "@/lib/terms";
import { Capabilities } from "./capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.overview };

const LAW = "Law or Regulation";

const HEADLINES: { icon: LucideIcon; title: string; sub: string; detail: string; href: string }[] = [
  { icon: Layers, title: "Every rule you answer to.", sub: "One map of your controls.", detail: "Every law, regulation, standard and framework in scope, broken into requirements and linked to the controls you already run.", href: "/frameworks" },
  { icon: RefreshCcw, title: "Compliance that keeps pace", sub: "with the rules.", detail: "When a rule changes, only the affected links are re-mapped, so your view is always current.", href: "/sources" },
  { icon: Gauge, title: "Know where you stand.", sub: "Against every rule that applies.", detail: "See what's met, partly met, and open, from board view down to a single clause.", href: "/controls" },
];

const tally = (items: string[]) => [...items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())];

/** Yellow label used on the hero and the closing banner. */
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded bg-[#fff3a3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2e2e38]">{children}</span>;
}

/** Overview: what the platform does, with the size of the document library and the client's mapping. */
export default async function OverviewPage() {
  const docs = await prisma.framework.findMany({ select: { name: true, type: true, jurisdiction: true } });
  if (docs.length === 0) {
    return (
      <Page>
        <PageHeader title={TERMS.overview} />
        <Card>
          <EmptyState icon={DatabaseZap} title="No authoritative documents loaded" description="Load the document library to populate the platform."
            action={<Button asChild variant="primary"><Link href="/data">Go to {TERMS.data}</Link></Button>} />
        </Card>
      </Page>
    );
  }

  const [links, controls, mappings] = await Promise.all([
    prisma.sourceRelationship.count({ where: { kind: "CROSS_FRAMEWORK", fromCitationId: { not: null }, toCitationId: { not: null } } }),
    prisma.ccfControl.count({ where: { inScope: true } }),
    prisma.controlObligation.count({ where: { control: { inScope: true } } }),
  ]);
  // Framework coverage: documents by publisher, plus laws and jurisdictions; largest first.
  const coverage = [
    ...tally(docs.map((d) => publisherOf(d.name))).filter(([k]) => k !== "Other").map(([label, n]) => ({ n, label })),
    { n: docs.filter((d) => d.type === LAW).length, label: "Laws and regulations" },
    { n: new Set(docs.map((d) => d.jurisdiction).filter((j) => j && j !== "Global")).size, label: "Jurisdictions" },
  ].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  return (
    <Page>
      {/* Hero */}
      <section className="mb-4 rounded-xl border border-border bg-surface px-6 py-6 shadow-xs sm:px-7">
        <div className="border-l-[3px] border-[#ffe600] pl-5">
          <Tag>Regulatory Intelligence</Tag>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Your compliance landscape, connected</div>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.2] tracking-tight text-fg sm:text-[30px]">One regulatory landscape.<br />One connected view of compliance.</h1>
          <p className="mt-3 max-w-5xl text-[13px] leading-relaxed text-muted">Regulations multiply every year. Requirements evolve, frameworks overlap, and manually mapping them to existing controls creates unnecessary complexity.</p>
          <p className="mt-2 max-w-5xl text-[13px] leading-relaxed text-muted">Our AI-powered platform continuously tracks regulatory updates, identifies emerging requirements and intelligently maps them to your existing controls, helping you stay ahead of regulatory change and maintain a connected view of compliance.</p>
        </div>
      </section>

      {/* Headline bar: detail on hover, each opens the page behind it */}
      <section className="relative z-10 mb-7 grid divide-y divide-border rounded-xl border border-border bg-surface shadow-xs md:grid-cols-3 md:divide-x md:divide-y-0">
        {HEADLINES.map((h) => (
          <Link key={h.title} href={h.href} className="group relative flex items-start gap-3 px-4 py-3.5 outline-none transition-colors first:rounded-l-xl last:rounded-r-xl hover:bg-accent-soft focus-visible:bg-accent-soft">
            <h.icon className="mt-0.5 size-4 shrink-0 text-fg-2" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-fg">{h.title}</span>
              <span className="block text-[11.5px] text-fg-2">{h.sub}</span>
            </span>
            <span role="tooltip" className="pointer-events-none absolute left-2 top-full z-20 mt-2 w-[290px] max-w-[calc(100vw-2rem)] translate-y-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[12.5px] leading-snug text-fg-2 opacity-0 shadow-pop transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
              {h.detail}
            </span>
          </Link>
        ))}
      </section>

      {/* Capabilities */}
      <section className="mb-7">
        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Capabilities</div>
          <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight text-fg">What the platform offers</h2>
        </div>
        <Capabilities frameworks={docs.length} coverage={coverage} connected={{ links, controls, mappings }} />
      </section>

      {/* Closing banner */}
      <section className="grid overflow-hidden rounded-xl border border-border bg-surface shadow-xs md:grid-cols-[1.15fr_1fr]">
        <div className="px-7 py-8">
          <Tag>Regulatory Intelligence</Tag>
          <h2 className="mt-3 text-[24px] font-semibold leading-[1.2] tracking-tight text-fg">Stay ahead of change.<br />Stay connected to compliance.</h2>
          <p className="mt-2 text-[13px] text-muted">A smarter way to navigate evolving regulations and connect requirements to the controls that matter.</p>
          <Link href="/controls" className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#ffe600] px-3.5 py-2 text-[12px] font-semibold text-[#2e2e38] transition hover:bg-[#fff066]">
            Track your compliance <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div aria-hidden className="relative hidden min-h-[200px] bg-gradient-to-br from-success-soft/30 to-success-soft md:block">
          <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
            {[0, 1, 2, 3, 4].map((i) => (
              <path key={i} d={`M -20 ${170 - i * 18} C 90 ${110 - i * 20}, 170 ${230 - i * 16}, 260 ${150 - i * 22} S 380 ${60 - i * 8}, 430 ${90 - i * 14}`}
                fill="none" stroke="var(--success)" strokeOpacity={0.1 + i * 0.03} strokeWidth={1.2} />
            ))}
            <path d="M 250 230 C 300 160, 330 140, 420 120 L 420 230 Z" fill="var(--success)" fillOpacity={0.06} />
            {[[300, 70, 4.5], [345, 122, 3], [380, 150, 4], [318, 172, 5], [255, 105, 2.5], [372, 40, 2.5]].map(([x, y, r]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="var(--success)" fillOpacity={0.55} />
            ))}
          </svg>
        </div>
      </section>
    </Page>
  );
}
