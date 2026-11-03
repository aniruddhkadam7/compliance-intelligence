import Link from "next/link";
import {
  ArrowRight, BadgeCheck, ChevronDown, DatabaseZap, FileCheck2, Gauge, Globe2, Landmark, Layers, MapPinned, Network,
  RefreshCcw, ScanSearch, ShieldCheck, Sparkles, Upload, type LucideIcon,
} from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { publisherOf } from "@/lib/queries/sources";
import { matrixPairs } from "@/lib/queries/framework-matrix";
import { listVersionUpdates } from "@/lib/updates/impact";
import { shortName } from "@/lib/frameworks";
import { TERMS } from "@/lib/terms";
import { cn, formatDate, formatNumber, formatPercent } from "@/lib/utils";
import { Donut } from "./charts";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.overview };

const STATEMENT =
  "Regulations multiply every year, and each one is written in its own language, while your controls are written in yours. Matching the two by hand is slow, inconsistent, and repeated at every audit. We map your existing controls to every rule in scope, so you can show where you stand on demand, find gaps before auditors do, and test once to prove compliance everywhere.";

const LAW = "Law or Regulation";
const PRIVACY = /GDPR|PIPL|privacy|personal (data|information)|data protection/i;
const SECTOR = /CFR|SOX|Sarbanes|HIPAA|HITECH|DORA|PCI|Basel|financial|medical|pharma/i;
type Doc = { id: string; name: string; type: string | null; jurisdiction: string | null; family: string | null; versionLabel: string | null };
/** Coverage groups, each with a fixed categorical colour (validated palette, light and dark). */
const GROUPS: { name: string; icon: LucideIcon; color: string; test: (d: Doc) => boolean }[] = [
  { name: "Global standards", icon: Globe2, color: "var(--chart-1)", test: (d) => d.type !== LAW },
  { name: "Data and privacy laws", icon: ShieldCheck, color: "var(--chart-2)", test: (d) => d.type === LAW && PRIVACY.test(d.name) },
  { name: "Sector regulations", icon: Landmark, color: "var(--chart-3)", test: (d) => d.type === LAW && !PRIVACY.test(d.name) && SECTOR.test(d.name) },
  { name: "Local and regional rules", icon: MapPinned, color: "var(--chart-4)", test: (d) => d.type === LAW && !PRIVACY.test(d.name) && !SECTOR.test(d.name) },
];
/** Update-check states: reserved status colours, always shown with a label. */
const STATUS: Record<string, { label: string; color: string }> = {
  UP_TO_DATE: { label: "Up to date", color: "var(--success)" },
  UPDATE_AVAILABLE: { label: "Update available", color: "var(--warning)" },
  UNABLE_TO_VERIFY: { label: "Unable to verify", color: "var(--chart-muted)" },
  CHECK_FAILED: { label: "Check failed", color: "var(--danger)" },
  NOT_CHECKED: { label: "Not checked", color: "var(--surface-3)" },
};

const version = (v: string | null) => { const m = (v ?? "").match(/\d+(\.\d+)*/); return m ? m[0].split(".").map(Number) : []; };
const newer = (a: Doc, b: Doc) => { const x = version(a.versionLabel), y = version(b.versionLabel); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };
const tally = (items: string[]) => [...items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
const pct = (n: number, d: number) => (d ? n / d : 0);

/** Hover or focus reveal; the space is reserved so nothing moves. */
const REVEAL = "translate-y-1 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100";

/* ---------- small building blocks ---------- */

function Widget({ title, icon: Icon, href, children, className }: { title: string; icon: LucideIcon; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-xl border border-border bg-surface shadow-xs", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon className="size-4 text-muted" />
        <span className="flex-1 text-[13px] font-semibold text-fg">{title}</span>
        {href && <Link href={href} className="text-muted hover:text-fg" aria-label={`Open ${title}`}><ArrowRight className="size-3.5" /></Link>}
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </div>
  );
}

function Big({ value, label, tone }: { value: React.ReactNode; label: React.ReactNode; tone?: "warning" | "success" }) {
  return (
    <div>
      <div className={cn("text-[28px] font-semibold leading-none tracking-tight tabular", tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-fg")}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

/** One proportion: filled track with the numbers beside it. */
function Meter({ label, value, total, color = "var(--chart-1)" }: { label: string; value: number; total: number; color?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-fg-2" title={label}>{label}</span>
        <span className="shrink-0 tabular text-muted"><b className="font-medium text-fg">{formatNumber(value)}</b>/{formatNumber(total)} · {formatPercent(pct(value, total), 0)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${pct(value, total) * 100}%`, background: color }} /></div>
    </div>
  );
}

/** Part-to-whole in one bar, 2px gaps between segments, with a labelled legend. */
function Stacked({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => <div key={p.label} title={`${p.label}: ${p.value}`} style={{ flexGrow: p.value, background: p.color }} />)}
        {!total && <div className="flex-1 bg-surface-3" />}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-fg-2">{p.label}</span>
            <span className="tabular font-medium text-fg">{formatNumber(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
          <span className="min-w-0 flex-1 truncate text-fg-2">{s.label}</span>
          <span className="tabular font-medium text-fg">{formatNumber(s.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-fg">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ---------- page ---------- */

/** Overview: the five sections of the product story, each card showing live figures from the platform. */
export default async function OverviewPage() {
  const docs = await prisma.framework.findMany({ select: { id: true, name: true, type: true, jurisdiction: true, family: true, versionLabel: true } });
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

  // One document per family, as in Sources (latest version); earlier versions are kept for comparison.
  const latest = new Map<string, Doc>();
  for (const d of docs) { const k = d.family ?? d.name, cur = latest.get(k); if (!cur || newer(d, cur)) latest.set(k, d); }
  const current = [...latest.values()].sort((a, b) => shortName(a.name).localeCompare(shortName(b.name), undefined, { numeric: true }));
  const ids = current.map((d) => d.id);
  const earlier = docs.length - current.length;

  const [reqRows, checks, controls, mappedControls, links, procedures, evidence, covered, procSpread, proposals, reviewedWithReason, lastImport, pairs, updates] = await Promise.all([
    prisma.citation.groupBy({ by: ["frameworkId"], _count: { _all: true } }),
    prisma.updateCheck.findMany({ where: { frameworkId: { in: ids } }, orderBy: { checkedAt: "desc" }, select: { frameworkId: true, status: true, checkedAt: true } }),
    prisma.ccfControl.count(),
    prisma.ccfControl.count({ where: { obligations: { some: {} } } }),
    prisma.controlObligation.count(),
    prisma.testProcedure.count(),
    prisma.evidenceRequirement.count(),
    // Per document: requirements linked to at least one client control, and the controls involved.
    prisma.$queryRaw<{ fw: string; reqs: bigint; ctrls: bigint }[]>`
      SELECT c."frameworkId" AS fw, COUNT(DISTINCT c.id) AS reqs, COUNT(DISTINCT o."controlId") AS ctrls
      FROM "ControlObligation" o JOIN "Citation" c ON c.id = o."citationId" GROUP BY 1`,
    // Test procedures by how many documents they provide evidence for.
    prisma.$queryRaw<{ n: bigint; procs: bigint }[]>`
      SELECT n, COUNT(*) AS procs FROM (
        SELECT t."testProcedureId", COUNT(DISTINCT c."frameworkId") AS n
        FROM "TestProcedureObligation" t JOIN "Citation" c ON c.id = t."citationId" GROUP BY 1) x
      GROUP BY n`,
    prisma.mappingProposal.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.mappingProposal.count({ where: { status: { in: ["APPROVED", "REJECTED"] }, reviewedBy: { not: null } } }),
    prisma.importJob.findFirst({ where: { kind: "CLIENT_CONTROLS", status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { fileName: true, completedAt: true } }),
    matrixPairs("supplied"),
    listVersionUpdates(),
  ]);

  // Library
  const reqs = new Map(reqRows.map((r) => [r.frameworkId, r._count._all]));
  const totalReqs = current.reduce((n, d) => n + (reqs.get(d.id) ?? 0), 0);
  const groups = GROUPS.map((g) => ({ ...g, items: current.filter(g.test) })).filter((g) => g.items.length);
  const publishers = tally(current.map((d) => publisherOf(d.name))).filter(([k]) => k !== "Other");
  const laws = current.filter((d) => d.type === LAW).length;
  const jurisdictions = new Set(current.map((d) => d.jurisdiction).filter((j) => j && j !== "Global")).size;

  // Update status (latest check per document)
  const status = new Map<string, string>();
  let lastChecked: Date | null = null;
  for (const c of checks) if (!status.has(c.frameworkId)) { status.set(c.frameworkId, c.status); if (!lastChecked || c.checkedAt > lastChecked) lastChecked = c.checkedAt; }
  const statusOf = (id: string) => status.get(id) ?? "NOT_CHECKED";
  const statusSlices = Object.entries(STATUS).map(([k, s]) => ({ ...s, value: current.filter((d) => statusOf(d.id) === k).length })).filter((s) => s.value > 0);
  const upToDate = current.filter((d) => statusOf(d.id) === "UP_TO_DATE").length;
  const lastUpdate = updates[0];
  const changeCounts = (lastUpdate?.counts ?? {}) as Record<string, number>;
  const vname = (r: { short: string; version: string | null } | null | undefined) => (!r ? "" : r.version && !r.short.includes(r.version) ? `${r.short} ${r.version}` : r.short);

  // Client mapping
  const coveredBy = new Map(covered.map((r) => [r.fw, { reqs: Number(r.reqs), ctrls: Number(r.ctrls) }]));
  const mappedDocs = docs.filter((d) => coveredBy.has(d.id)).map((d) => ({ d, ...coveredBy.get(d.id)!, total: reqs.get(d.id) ?? 0 })).sort((a, b) => b.ctrls - a.ctrls);
  const inScopeReqs = mappedDocs.reduce((n, m) => n + m.total, 0);
  const linkedReqs = mappedDocs.reduce((n, m) => n + m.reqs, 0);
  const prop = Object.fromEntries(proposals.map((p) => [p.status, p._count._all])) as Record<string, number>;
  const reviewed = (prop.APPROVED ?? 0) + (prop.REJECTED ?? 0);
  const spread = Object.fromEntries(procSpread.map((r) => [Number(r.n), Number(r.procs)])) as Record<number, number>;
  const mappedProcs = Object.values(spread).reduce((n, v) => n + v, 0);
  const multi = Object.entries(spread).filter(([n]) => Number(n) > 1).reduce((s, [, v]) => s + v, 0);
  const pairLinks = pairs.reduce((n, p) => n + p.links, 0);

  const HEADLINES = [
    { icon: Layers, title: "Every rule you answer to.", sub: "One map of your controls.", body: "Every law, regulation, standard and framework in scope, broken into requirements and linked to the controls you already run.", action: "See the map", href: "/controls" },
    { icon: RefreshCcw, title: "Compliance that keeps pace", sub: "with the rules.", body: "When a rule changes, only the affected links are re-mapped, so your view is always current.", action: "See how it updates", href: "/change-analytics" },
    { icon: Gauge, title: "Know where you stand.", sub: "Against every rule that applies.", body: "See what's met, partly met, and open, from board view down to a single clause.", action: "Explore sample map", href: "/controls" },
  ];

  return (
    <Page>
      <PageHeader title={TERMS.overview} description={lastChecked ? `Live figures · library last checked against publishers ${formatDate(lastChecked)}` : "Live figures from the platform"} />

      {/* 1. Regulation statement, with the scale behind it */}
      <section className="mb-5 grid overflow-hidden rounded-2xl bg-[#2e2e38] lg:grid-cols-[1fr_auto] dark:bg-surface-3">
        <div className="px-6 py-7 sm:px-9">
          <div className="border-l-4 border-[#ffe600] pl-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffe600]">Why it matters</div>
            <p className="mt-2 text-base leading-relaxed text-white/90 sm:text-[17px]">{STATEMENT}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-white/10 lg:grid-cols-1 lg:border-l lg:border-t-0">
          {[
            { n: formatNumber(current.length), l: "authoritative documents" },
            { n: formatNumber(totalReqs), l: "requirements broken out" },
            { n: formatNumber(links), l: "control-to-requirement links" },
          ].map((s, i) => (
            <div key={s.l} className={cn("px-6 py-4 lg:min-w-[220px]", i > 0 && "border-l border-white/10 lg:border-l-0 lg:border-t")}>
              <div className="text-2xl font-semibold tabular text-white">{s.n}</div>
              <div className="text-xs text-white/60">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Headline cards: live figures, with the story and link on hover */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        {HEADLINES.map((h, i) => (
          <div key={h.title} tabIndex={0} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xs outline-none transition hover:-translate-y-0.5 hover:shadow-pop focus-visible:ring-2 focus-visible:ring-[#ffe600]">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-fg transition group-hover:bg-[#ffe600] group-hover:text-[#2e2e38]"><h.icon className="size-[18px]" /></span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold leading-snug text-fg">{h.title}</div>
                <div className="text-[15px] leading-snug text-muted">{h.sub}</div>
              </div>
            </div>

            <div className="mt-4 flex-1 pb-1">
              {i === 0 && (
                <div className="space-y-3">
                  <Big value={formatNumber(totalReqs)} label={`requirements across ${current.length} documents`} />
                  <Stacked parts={groups.map((g) => ({ label: g.name, value: g.items.reduce((n, d) => n + (reqs.get(d.id) ?? 0), 0), color: g.color }))} />
                </div>
              )}
              {i === 1 && (
                <div className="flex items-center gap-4">
                  <Donut data={statusSlices} center={`${upToDate}/${current.length}`} sub="up to date" size={112} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Legend items={statusSlices} />
                    {lastUpdate?.counts && (
                      <p className="border-t border-border pt-2 text-[11px] text-muted">
                        Last update {vname(lastUpdate.previous)} → {vname(lastUpdate.current)}: <b className="text-fg-2">{changeCounts.ADDED ?? 0} added</b>, <b className="text-fg-2">{changeCounts.MODIFIED ?? 0} modified</b>
                      </p>
                    )}
                  </div>
                </div>
              )}
              {i === 2 && (
                mappedDocs.length ? (
                  <div className="space-y-3">
                    <Big value={formatPercent(pct(linkedReqs, inScopeReqs), 0)} label={`of in-scope requirements linked to a control (${formatNumber(linkedReqs)} of ${formatNumber(inScopeReqs)})`} />
                    <div className="space-y-2">{mappedDocs.slice(0, 3).map((m) => <Meter key={m.d.id} label={shortName(m.d.name)} value={m.reqs} total={m.total} color="var(--chart-3)" />)}</div>
                  </div>
                ) : <p className="text-xs text-muted">Upload the client&apos;s controls to see where they stand.</p>
              )}
            </div>

            <div className={cn("absolute inset-x-0 bottom-0 border-t border-border bg-surface/95 px-5 pb-5 pt-3 backdrop-blur-sm", REVEAL)}>
              <p className="text-[13px] leading-relaxed text-fg-2">{h.body}</p>
              <Link href={h.href} className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg underline-offset-4 hover:underline">{h.action} <ArrowRight className="size-3.5" /></Link>
            </div>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-[#ffe600] transition-transform duration-300 group-hover:scale-x-100 group-focus-within:scale-x-100" />
          </div>
        ))}
      </section>

      {/* 3. Capabilities, each with the figures behind it */}
      <section className="mb-8">
        <SectionHeading eyebrow="Capabilities" title="What the platform offers" />
        <div tabIndex={0} className="group mb-4 overflow-hidden rounded-xl border border-border bg-surface shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#ffe600]">
          <Link href="/sources" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-4">
            <span className="flex items-center gap-3">
              <span className="text-4xl font-semibold tracking-tight tabular text-fg">{current.length}</span>
              <span className="text-sm font-medium leading-tight text-fg-2">Compliance frameworks supported<span className="block text-xs font-normal text-muted">laws, regulations and standards in the library</span></span>
            </span>
            {earlier > 0 && <>
              <span aria-hidden className="hidden h-9 w-px bg-border sm:block" />
              <span className="flex items-center gap-3">
                <span className="text-2xl font-semibold tabular text-fg-2">+{earlier}</span>
                <span className="text-sm leading-tight text-muted">earlier version{earlier === 1 ? "" : "s"}<span className="block text-xs">kept for comparison</span></span>
              </span>
            </>}
            <span className="flex items-center gap-1 text-xs text-subtle">Breakdown <ChevronDown className="size-3.5 transition group-hover:rotate-180 group-focus-within:rotate-180" /></span>
          </Link>
          <div className="grid grid-rows-[0fr] transition-all duration-300 group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4 lg:grid-cols-6">
                {[...publishers.map(([label, n]) => ({ n, label })), { n: laws, label: "Laws and regulations" }, { n: jurisdictions, label: "Jurisdictions" }].map((s) => (
                  <div key={s.label} className="bg-surface-2 px-4 py-2.5"><div className="text-base font-semibold tabular text-fg">{s.n}</div><div className="text-xs text-muted">{s.label}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Widget title="Live compliance map" icon={Network} href="/controls">
            <Big value={formatNumber(links)} label={`links between ${formatNumber(mappedControls)} controls and ${formatNumber(linkedReqs)} requirements`} />
            <div className="mt-4 space-y-2">{mappedDocs.slice(0, 4).map((m) => <Meter key={m.d.id} label={shortName(m.d.name)} value={m.ctrls} total={controls} />)}</div>
            <p className="mt-auto pt-3 text-[11px] text-subtle">Controls mapped per document</p>
          </Widget>

          <Widget title="AI proposes, experts approve" icon={Sparkles} href="/change-analytics">
            <Big value={formatNumber((prop.PENDING ?? 0) + reviewed)} label="mapping suggestions from version updates" />
            <div className="mt-4"><Stacked parts={[
              { label: "Awaiting review", value: prop.PENDING ?? 0, color: "var(--warning)" },
              { label: "Approved", value: prop.APPROVED ?? 0, color: "var(--success)" },
              { label: "Rejected", value: prop.REJECTED ?? 0, color: "var(--chart-muted)" },
            ]} /></div>
            <p className="mt-auto pt-3 text-[11px] text-subtle">Nothing changes a mapping until a specialist approves it</p>
          </Widget>

          <Widget title="Built on your controls" icon={Upload} href="/controls">
            <div className="grid grid-cols-3 gap-3">
              <Big value={formatNumber(controls)} label="controls" />
              <Big value={formatNumber(procedures)} label="test procedures" />
              <Big value={formatNumber(evidence)} label="evidence items" />
            </div>
            <div className="mt-4"><Meter label="Controls mapped to a requirement" value={mappedControls} total={controls} color="var(--chart-3)" /></div>
            <p className="mt-auto pt-3 text-[11px] text-subtle">{lastImport ? <>Last upload {lastImport.completedAt ? formatDate(lastImport.completedAt) : ""} · {lastImport.fileName}</> : "No control list uploaded yet"}</p>
          </Widget>

          <Widget title="Explainable by design" icon={BadgeCheck} href="/change-analytics">
            <Big value={formatNumber(reviewedWithReason)} label="decisions recorded with reviewer and reasoning" tone={reviewedWithReason ? "success" : undefined} />
            <div className="mt-4 space-y-2">
              <Meter label="Reviewed suggestions with a named approver" value={reviewedWithReason} total={Math.max(reviewed, reviewedWithReason)} color="var(--success)" />
              <Meter label="Framework links with a stated relationship" value={pairLinks} total={pairLinks} color="var(--chart-2)" />
            </div>
            <p className="mt-auto pt-3 text-[11px] text-subtle">{updates.length} version comparison{updates.length === 1 ? "" : "s"} with section-by-section explanations</p>
          </Widget>

          <Widget title="Test once, prove everywhere" icon={FileCheck2} href="/controls">
            <Big value={formatPercent(pct(multi, mappedProcs), 0)} label={`of mapped test procedures count for 2+ documents (${formatNumber(multi)} of ${formatNumber(mappedProcs)})`} />
            <div className="mt-4"><Stacked parts={[
              { label: "1 document", value: spread[1] ?? 0, color: "var(--chart-muted)" },
              { label: "2 documents", value: spread[2] ?? 0, color: "var(--chart-1)" },
              { label: "3+ documents", value: Object.entries(spread).filter(([n]) => Number(n) >= 3).reduce((s, [, v]) => s + v, 0), color: "var(--chart-5)" },
            ]} /></div>
            <p className="mt-auto pt-3 text-[11px] text-subtle">Evidence from one test counts for every document it maps to</p>
          </Widget>

          <Widget title="Gap visibility" icon={ScanSearch} href="/controls?mapping=unmapped">
            <div className="grid grid-cols-2 gap-3">
              <Big value={formatNumber(inScopeReqs - linkedReqs)} label="in-scope requirements with no control" tone={inScopeReqs - linkedReqs ? "warning" : "success"} />
              <Big value={formatNumber(controls - mappedControls)} label="controls not mapped yet" tone={controls - mappedControls ? "warning" : "success"} />
            </div>
            <div className="mt-4 space-y-2">{mappedDocs.slice(0, 3).map((m) => <Meter key={m.d.id} label={`${shortName(m.d.name)}: open`} value={m.total - m.reqs} total={m.total} color="var(--warning)" />)}</div>
            <p className="mt-auto pt-3 text-[11px] text-subtle">Gaps in documents the client is mapped to</p>
          </Widget>
        </div>
      </section>

      {/* 4. Regulations covered: every document with its size, status and client mapping */}
      <section className="mb-8">
        <SectionHeading eyebrow="Coverage" title="Regulations covered" action={<Button asChild size="sm" variant="ghost"><Link href="/sources">All sources <ArrowRight /></Link></Button>} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {[groups.slice(0, 1), groups.slice(1)].map((col, ci) => (
          <div key={ci} className="space-y-4">
          {col.map((g) => {
            const max = Math.max(1, ...g.items.map((d) => reqs.get(d.id) ?? 0));
            return (
              <div key={g.name} className="rounded-xl border border-border bg-surface shadow-xs">
                <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: g.color }} />
                  <g.icon className="size-4 text-muted" />
                  <span className="flex-1 text-[13px] font-semibold text-fg">{g.name}</span>
                  <span className="text-xs tabular text-muted">{g.items.length} document{g.items.length === 1 ? "" : "s"} · {formatNumber(g.items.reduce((n, d) => n + (reqs.get(d.id) ?? 0), 0))} requirements</span>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="text-[10px] uppercase tracking-wide text-subtle"><th className="px-4 pb-1 pt-2 text-left font-medium">Document</th><th className="px-2 pb-1 pt-2 text-left font-medium">Requirements</th><th className="px-2 pb-1 pt-2 text-right font-medium">Controls</th><th className="px-4 pb-1 pt-2 text-right font-medium">Status</th></tr></thead>
                  <tbody>
                    {g.items.map((d) => {
                      const n = reqs.get(d.id) ?? 0, st = STATUS[statusOf(d.id)], c = coveredBy.get(d.id)?.ctrls ?? 0;
                      return (
                        <tr key={d.id} className="border-t border-border/60 hover:bg-surface-2">
                          <td className="max-w-[180px] truncate px-4 py-1.5"><Link href={`/sources/${d.id}`} className="font-medium text-fg-2 hover:text-fg" title={d.name}>{shortName(d.name)}</Link></td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: g.color }} /></div>
                              <span className="tabular text-fg">{formatNumber(n)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular text-fg-2">{c ? formatNumber(c) : <span className="text-subtle">—</span>}</td>
                          <td className="px-4 py-1.5"><span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-fg-2"><span className="size-2 rounded-full" style={{ background: st.color }} />{st.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          </div>
          ))}
        </div>
      </section>

      {/* 5. Closing call to action */}
      <section className="flex flex-col items-start gap-5 rounded-2xl bg-[#2e2e38] px-6 py-7 sm:flex-row sm:items-center sm:px-9 dark:bg-surface-3">
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-semibold tracking-tight text-white">Test your controls.</div>
          <p className="mt-1 text-sm text-white/75">Upload your control list and see your compliance map in under 2 minutes.</p>
          {lastImport && <p className="mt-2 text-xs text-white/55">Current map: {formatNumber(controls)} controls · {formatNumber(links)} links · last upload {lastImport.completedAt ? formatDate(lastImport.completedAt) : ""}</p>}
        </div>
        <Link href="/data?tab=import" className="inline-flex items-center gap-2 rounded-lg bg-[#ffe600] px-5 py-2.5 text-sm font-semibold text-[#2e2e38] transition hover:bg-[#fff066]">
          <Upload className="size-4" /> Test your controls
        </Link>
      </section>
    </Page>
  );
}
