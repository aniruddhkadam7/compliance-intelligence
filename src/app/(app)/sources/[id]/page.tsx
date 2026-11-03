import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bot, CheckCircle2, CircleDashed, ExternalLink, FlaskConical, GitCompareArrows, History, Layers, Radar, ShieldAlert, UserCheck } from "lucide-react";
import { KeyValue, Mono, Page, PageHeader } from "@/components/common";
import { LongText } from "@/components/long-text";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSource } from "@/lib/queries/sources";
import { getSession } from "@/lib/auth/server";
import { BASIS_LABEL } from "@/lib/sources/applicability";
import { REVIEW_STATUS } from "@/lib/sources/status";
import { ReviewButtons } from "./review-buttons";
import { VersionComparison } from "./version-comparison";
import { UpdatePanel } from "./update-panel";
import { TERMS } from "@/lib/terms";
import { cn, formatDate, formatNumber, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PLACEHOLDER = "XX";

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border-strong bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
      <Badge tone="outline" className="mr-2">Placeholder</Badge>{children}
    </div>
  );
}

type StepState = "IMPLEMENTED" | "PROTOTYPE" | "NOT_CONNECTED" | "ATTENTION";
const STEP: Record<StepState, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  IMPLEMENTED: { label: "Implemented", tone: "success", icon: CheckCircle2 },
  ATTENTION: { label: "Needs attention", tone: "warning", icon: ShieldAlert },
  PROTOTYPE: { label: "Prototype", tone: "info", icon: FlaskConical },
  NOT_CONNECTED: { label: "Not connected", tone: "neutral", icon: CircleDashed },
};

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, session] = await Promise.all([getSource(id), getSession()]);
  if (!d) notFound();
  const canWrite = session?.role === "admin" || session?.role === "analyst";
  const cmp = d.comparison?.identifiers.comparable ? d.comparison.identifiers : null;

  const versionChange = d.updates.find((u) => u.changeType === "VERSION_CHANGE");
  const pendingUpdates = d.updates.filter((u) => u.reviewStatus === "NEW");
  const hasTransitions = Object.keys(d.transitions).length > 0;
  const monitored = d.monitoring.length > 0;

  // Version history: versions in the library, plus versions detected by monitoring.
  const history = [
    ...d.familyVersions.map((v) => ({ key: v.id, version: v.version ?? v.short, label: v.short, note: v.id === d.id ? "Current version in library" : "In library", href: `/sources/${v.id}`, current: v.id === d.id })),
    ...d.updates.filter((u) => u.changeType === "VERSION_CHANGE" && u.newValue).map((u) => ({ key: u.id, version: u.newValue!, label: `Detected ${formatDate(u.detectedAt)}`, note: `Detected by ${u.connector}`, href: `/updates?update=${u.id}`, current: false })),
  ];

  // Supplied transitions take precedence; otherwise the structural comparison of both loaded versions.
  const changeCategories: [string, string | null, string?][] = [
    ["New sections introduced", hasTransitions ? String(d.transitions.ADDED ?? 0) : cmp ? String(cmp.added.length) : null],
    ["Existing sections modified", hasTransitions ? String(d.transitions.MODIFIED ?? 0) : cmp ? String(cmp.changed.length) : null],
    ["Sections removed", hasTransitions ? String(d.transitions.REMOVED ?? 0) : cmp ? String(cmp.removed.length) : null],
    ["Requirements consolidated", hasTransitions ? String(d.transitions.COMBINED ?? 0) : null, "Needs a legacy-to-latest mapping file"],
    ["Requirements split", hasTransitions ? String(d.transitions.SPLIT ?? 0) : null, "Needs a legacy-to-latest mapping file"],
    ["New domains", d.comparison ? String(d.comparison.domains.filter((x) => x.status === "ONLY_CURRENT").length) : null],
    ["Scope changes", null, "Summary to be supplied"],
    ["New regulatory expectations", null, "Summary to be supplied"],
  ];

  const pipeline: { title: string; state: StepState; detail: string }[] = [
    { title: "Source monitoring", state: monitored ? "IMPLEMENTED" : "NOT_CONNECTED", detail: monitored ? `${d.monitoring.map((m) => m.name).join(", ")} · ${d.monitoring[0].lastCheckedAt ? `last checked ${formatRelative(d.monitoring[0].lastCheckedAt)}` : "configured, not checked yet"}` : "No connector for this document yet" },
    { title: "Version change detection", state: !monitored ? "NOT_CONNECTED" : versionChange ? "ATTENTION" : "IMPLEMENTED", detail: versionChange ? `${versionChange.previousValue ?? "?"} → ${versionChange.newValue ?? "?"}` : !monitored ? "Requires monitoring" : d.monitoring[0].lastCheckedAt ? "No version change detected" : "Runs on the first check" },
    { title: "Previous vs current comparison", state: hasTransitions || d.comparison ? "IMPLEMENTED" : "NOT_CONNECTED", detail: hasTransitions ? "From the supplied legacy-to-latest mapping file" : d.comparison ? `Structural comparison with ${d.previousVersion?.short} (both versions loaded)` : "Needs the previous version loaded, or a legacy-to-latest mapping file" },
    { title: "AI-generated change summary", state: d.aiImport?.summary ? "IMPLEMENTED" : "NOT_CONNECTED", detail: d.aiImport?.summary ? `From AI document import of ${d.aiImport.fileName}, reviewed by ${d.aiImport.reviewedBy} on ${formatDate(d.aiImport.updatedAt)}` : "Available: upload the document under Data & Imports → AI document import" },
    { title: "New or modified sections", state: hasTransitions || cmp ? "IMPLEMENTED" : "NOT_CONNECTED", detail: hasTransitions ? `${d.transitions.ADDED ?? 0} added · ${d.transitions.MODIFIED ?? 0} modified` : cmp ? `${cmp.added.length} new · ${cmp.changed.length} reworded · ${cmp.removed.length} no longer present (by identifier)` : "Requires comparison data" },
    { title: "Potential impact indicators", state: d.clientControls ? "IMPLEMENTED" : "NOT_CONNECTED", detail: d.clientControls ? `${d.clientControls} client controls mapped to this document` : "No client controls mapped" },
    { title: "Human review required", state: pendingUpdates.length ? "ATTENTION" : "IMPLEMENTED", detail: pendingUpdates.length ? `${pendingUpdates.length} finding(s) awaiting review` : "Nothing waiting for review" },
    { title: "Approval status", state: d.updates.length ? (pendingUpdates.length ? "ATTENTION" : "IMPLEMENTED") : "NOT_CONNECTED", detail: d.updates.length ? `${d.updates.length - pendingUpdates.length} of ${d.updates.length} findings reviewed` : "No findings yet" },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: TERMS.sources, href: "/sources" }, { label: d.short }]}
        title={d.short}
        description={d.name}
        meta={
          <>
            {d.type && <Badge>{d.type}</Badge>}
            <Badge tone="outline">{d.publisher}</Badge>
            {pendingUpdates.length > 0 && <Badge tone="warning"><UserCheck /> Human review required</Badge>}
          </>
        }
        actions={d.documentUrl ? <Button asChild size="sm"><a href={d.documentUrl} target="_blank" rel="noopener noreferrer">Official source <ExternalLink /></a></Button> : null}
      />

      <div className="mb-4"><UpdatePanel d={d} role={session?.role ?? "viewer"} /></div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* A. Document information */}
          <Card>
            <CardHeader title="Document information" />
            <CardBody className="space-y-4">
              <KeyValue
                cols={3}
                items={[
                  { label: "Full name", value: d.name },
                  { label: "Document identifier", value: <Mono>{d.sourceId}</Mono> },
                  { label: "Document type", value: d.type },
                  { label: "Publisher", value: d.publisher },
                  { label: "Industry applicability", value: d.industry },
                  { label: "Jurisdiction", value: d.jurisdiction },
                  { label: "Current version", value: d.version },
                  {
                    label: "Previous version",
                    value: d.previousVersion ? <Link href={`/sources/${d.previousVersion.id}`} className="text-accent hover:underline">{d.previousVersion.short}</Link>
                      : d.recordedPrevious ? <span>{d.recordedPrevious.version ?? (/law|regulation/i.test(d.type ?? "") ? "None (original act)" : "None (first edition)")}{d.recordedPrevious.version && <span className="text-subtle"> · not loaded</span>}</span> : null,
                    hint: d.recordedPrevious?.note,
                  },
                  { label: "Loaded into the platform", value: formatDate(d.loadedAt), hint: "When this record was last imported; not a publication date" },
                  { label: "Publication date", value: d.publishedDate ? formatDate(d.publishedDate) : <span className="text-subtle">Not available</span>, hint: "Reported by the official source; never the date the platform checked it" },
                ]}
              />
              {d.description && <LongText text={d.description} lines={3} />}
            </CardBody>
          </Card>

          {/* C. Major changes */}
          <Card>
            <CardHeader title="Major changes" description={d.previousVersion ? `${d.previousVersion.short} → ${d.short}` : "Between the previous and current version"} icon={<Layers />} />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {changeCategories.map(([label, value, missing]) => (
                  <div key={label} className={cn("rounded-md border p-3", value == null ? "border-dashed border-border-strong" : "border-border")}>
                    <div className="text-[11px] text-muted">{label}</div>
                    {value == null
                      ? <div className="mt-1.5 text-xs text-subtle">{missing ?? (d.previousVersion ? "Not available" : "Only one version loaded")}</div>
                      : <div className="mt-1 text-[18px] font-semibold tabular text-fg">{value}</div>}
                  </div>
                ))}
              </div>
              {d.aiImport?.summary && (
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Bot className="size-3.5" /> AI-generated change summary · reviewed by {d.aiImport.reviewedBy}</div>
                  <p className="whitespace-pre-line text-[13px] text-fg-2">{d.aiImport.summary}</p>
                </div>
              )}
              {hasTransitions ? (
                <p className="text-xs text-muted">Counts come from the supplied legacy-to-latest mapping. <Link href="/change-analytics" className="text-accent hover:underline">Open in {TERMS.versionImpact}</Link></p>
              ) : d.comparison ? (
                <p className="text-xs text-muted">Counts come from a structural comparison of both loaded versions (by section identifier). Consolidations and splits need a supplied legacy-to-latest mapping. <a href="#comparison" className="text-accent hover:underline">See the comparison</a></p>
              ) : (
                <Placeholder>Summary of the major changes from the previous version (new sections, revised requirements, retired content and scope changes). Content to follow.</Placeholder>
              )}
            </CardBody>
          </Card>

          {d.comparison && d.previousVersion && <VersionComparison c={d.comparison} previous={d.previousVersion} current={d.short} />}

          {/* E. AI-assisted update intelligence */}
          <Card>
            <CardHeader title="Update intelligence" description="How changes to this document are detected and reviewed. Each step shows whether it is live today." icon={<Bot />} />
            <ol className="divide-y divide-border">
              {pipeline.map((p, i) => {
                const st = STEP[p.state];
                return (
                  <li key={p.title} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg-2">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-fg">{p.title}</div>
                      <div className="text-xs text-muted">{p.detail}</div>
                    </div>
                    <Badge tone={st.tone}><st.icon /> {st.label}</Badge>
                  </li>
                );
              })}
            </ol>
            {d.updates.length > 0 && (
              <div className="border-t border-border">
                <div className="px-4 pt-3 text-[13px] font-semibold text-fg">Detected findings</div>
                <ul className="divide-y divide-border">
                  {d.updates.map((u) => {
                    const r = REVIEW_STATUS[u.reviewStatus] ?? REVIEW_STATUS.NEW;
                    return (
                      <li key={u.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link href={`/updates?update=${u.id}`} className="text-[13px] font-medium text-fg hover:text-accent">{u.title}</Link>
                          <div className="line-clamp-2 text-xs text-muted">{u.summary}</div>
                          <div className="text-[11px] text-subtle">Detected {formatDate(u.detectedAt)} by {u.connector}</div>
                        </div>
                        <Badge tone={r.tone}>{r.label}</Badge>
                        {u.reviewStatus === "NEW" && canWrite && <ReviewButtons id={u.id} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {versionChange && (
              <div className="space-y-3 border-t border-border p-4">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge tone="warning">Version change</Badge>
                  <Mono>{versionChange.previousValue}</Mono><ArrowRight className="size-3.5 text-subtle" /><Mono>{versionChange.newValue}</Mono>
                  <span className="text-xs text-muted">· detected {formatRelative(versionChange.detectedAt)}</span>
                </div>
                <p className="text-[13px] text-fg-2">{versionChange.summary}</p>
                {!d.aiImport && <Placeholder>AI change analysis: upload the new version under Data & Imports → AI document import to extract its sections and generate a reviewed change summary.</Placeholder>}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="primary"><Link href={`/updates?update=${versionChange.id}`}><UserCheck /> Review and approve</Link></Button>
                  <Button asChild size="sm"><Link href="/updates"><Radar /> {TERMS.updates}</Link></Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* B. Version history */}
          <Card>
            <CardHeader title="Version history" icon={<History />} />
            <ol className="relative space-y-0 p-4">
              {history.map((h, i) => (
                <li key={h.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < history.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-border" aria-hidden />}
                  <span className={cn("mt-1 size-[11px] shrink-0 rounded-full border-2", h.current ? "border-accent bg-accent" : "border-border-strong bg-surface")} />
                  <Link href={h.href} className="min-w-0 hover:text-accent">
                    <div className="text-[13px] font-medium text-fg"><Mono>{h.version}</Mono> <span className="text-xs text-muted">· {h.label}</span></div>
                    <div className="text-[11px] text-muted">{h.note}</div>
                  </Link>
                </li>
              ))}
            </ol>
            {history.length <= 1 && <div className="px-4 pb-4"><Placeholder>Earlier versions and their dates. Content to follow.</Placeholder></div>}
          </Card>

          {/* D. Industry applicability and context */}
          <Card>
            <CardHeader title="Industry applicability and context" icon={<GitCompareArrows />} />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  { label: "IT applicability", value: d.applicability.tags.includes("IT") ? "Yes" : <span className="text-subtle">{d.applicability.basis === "SUPPLIED" ? "No" : "Not classified"}</span> },
                  { label: "OT applicability", value: d.applicability.tags.includes("OT") ? "Yes" : <span className="text-subtle">{d.applicability.basis === "SUPPLIED" ? "No" : "Not classified"}</span>, hint: BASIS_LABEL[d.applicability.basis] },
                  { label: "AI applicability", value: d.applicability.tags.includes("AI") ? "Yes" : <span className="text-subtle">{d.applicability.basis === "SUPPLIED" ? "No" : "Not classified"}</span>, hint: BASIS_LABEL[d.applicability.basis] },
                  { label: "Collection method", value: d.collection.methods.join(" · ") },
                  { label: "Relevant industries", value: d.industry },
                  { label: "Standards category", value: d.type },
                  { label: "Regulatory context", value: d.jurisdiction ? `${d.jurisdiction}${d.licensing ? ` · ${d.licensing}` : ""}` : null },
                  { label: "Obligations in library", value: formatNumber(d.obligations) },
                ]}
              />
              <div className="mt-3"><Placeholder>Industry best practices and how this document is typically applied. Content to follow.</Placeholder></div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  );
}
