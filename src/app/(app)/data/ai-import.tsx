"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Bot, CheckCircle2, FileText, Loader2, ShieldAlert, Sparkles, Trash2, UploadCloud, XCircle } from "lucide-react";
import { EmptyState, ErrorState, Mono, StatStrip } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/client/api";
import { driveImport } from "@/lib/client/import-jobs";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

interface Detected { title: string; shortTitle: string; publisher: string; version: string; publishedDate: string; documentType: string; jurisdiction: string; libraryFamily: string; notes: string; libraryVersion?: string }
interface Section { id: string; ordinal: number; identifier: string; title: string; path: string[]; text: string; verified: boolean; include: boolean; contentType: string | null; pageNumber: number | null; sheetName: string | null; rowNumber: number | null; confidence: number | null }
interface Quality { sections: number; verified: number; unverified: number; byContentType: Record<string, number>; missingIds: number; duplicateIds: number; numberingGaps: string[]; pagesOrSheets: number; partsProcessed: string; ocr: boolean; warnings: string[] }
interface Draft {
  id: string; fileName: string; status: string; model: string; pages: number; chunks: number; chunksDone: number; detected: Detected | null;
  matchKind: "SAME_VERSION" | "NEW_VERSION" | "NEW_DOCUMENT" | null; match: { id: string; name: string; sourceId: string; versionLabel: string | null } | null;
  summary: string | null; usage: { input: number; output: number; calls: number } | null; error: string | null; createdBy: string; reviewedBy: string | null; createdAt: string;
  publishedFrameworkId: string | null; suggestedSourceId: string; sections: Section[]; relationCounts: Record<string, number> | null;
  comparison: { base: { id: string; short: string }; summary: { added: number; removed: number; changed: number; unchanged: number; domainsAdded: string[]; domainsRemoved: string[]; segmentsAdded: number; segmentsRemoved: number; comparable: boolean } } | null;
}
interface ListItem { id: string; fileName: string; status: string; detected: Detected | null; matchKind: string | null; createdAt: string; createdBy: string; _count: { sections: number } }

const STATUS: Record<string, { label: string; tone: Tone }> = {
  EXTRACTING: { label: "Reading", tone: "info" }, READY: { label: "Ready for review", tone: "warning" }, PUBLISHED: { label: "Published", tone: "success" },
  DISCARDED: { label: "Discarded", tone: "neutral" }, REJECTED: { label: "Rejected", tone: "neutral" }, REVERTED: { label: "Reverted", tone: "neutral" }, FAILED: { label: "Failed", tone: "danger" },
};
const MODE = {
  SAME_VERSION: { label: "Update the existing document", hint: "Changed text is updated and new sections are added. Nothing is deleted." },
  NEW_VERSION: { label: "Add as a new version", hint: "Creates a new document next to the previous version; both remain in the library." },
  NEW_DOCUMENT: { label: "Add as a new document", hint: "Creates a new document in the library." },
} as const;
type Mode = keyof typeof MODE;

export function AiImport({ draftId, onOpen }: { draftId: string; onOpen: (id: string) => void }) {
  const list = useQuery({ queryKey: ["ai-imports"], queryFn: () => apiGet<{ configured: boolean; model: string; items: ListItem[] }>("/api/ai-import") });
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const start = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await apiSend<{ id: string }>("/api/ai-import", fd);
      toast.success("Document identified. Reading sections…");
      setFile(null);
      if (input.current) input.current.value = "";
      qc.invalidateQueries({ queryKey: ["ai-imports"] });
      onOpen(r.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (list.isLoading) return <Skeleton className="h-60" />;
  if (list.error) return <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>;
  const cfg = list.data!;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="text-[13px] text-fg-2">
            <div className="font-semibold text-fg">AI-assisted document import</div>
            Upload a framework or regulation as it is. The AI model identifies it and locates its sections; the requirement text is cut from your file word for word, never written by the AI.
            The result is a <b>draft</b>: nothing changes in the library until a reviewer publishes it.
            <div className="mt-1 text-xs text-muted">The document text is sent to OpenAI (<Mono className="text-[11px]">{cfg.model}</Mono>) for processing. Only upload documents you are permitted to share with that service.</div>
          </div>
        </CardBody>
      </Card>

      {!cfg.configured ? (
        <Card><EmptyState icon={Bot} title="AI is not configured" description="Set OPENROUTER_API_KEY (and optionally AI_MODEL, e.g. openai/gpt-6-luna) on the server to enable AI-assisted import." /></Card>
      ) : draftId ? (
        <DraftView id={draftId} onBack={() => onOpen("")} />
      ) : (
        <>
          <Card>
            <CardHeader title="Upload a document" description="PDF with a text layer, Excel (.xlsx) or text (.txt, .md, .csv) · up to 4 MB" />
            <CardBody className="flex flex-wrap items-center gap-3">
              <input ref={input} type="file" accept=".pdf,.xlsx,.txt,.md,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px] file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-[13px] file:text-fg" aria-label="Document file" />
              <Button variant="primary" disabled={!file || busy} onClick={start}>{busy ? <Loader2 className="animate-spin" /> : <UploadCloud />} {busy ? "Identifying…" : "Read with AI"}</Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent AI imports" />
            {cfg.items.length ? (
              <ul className="divide-y divide-border">
                {cfg.items.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => onOpen(d.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-surface-2">
                      <FileText className="size-4 shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1"><span className="font-medium text-fg">{d.detected?.shortTitle || d.fileName}</span> <span className="text-xs text-muted">· {d.fileName} · {d._count.sections} sections</span></span>
                      <span className="text-xs text-muted">{formatDateTime(d.createdAt)}</span>
                      <Badge tone={STATUS[d.status]?.tone ?? "neutral"}>{STATUS[d.status]?.label ?? d.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-4 text-xs text-muted">No AI imports yet.</p>}
          </Card>
        </>
      )}
    </div>
  );
}

export function DraftView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["ai-import", id], queryFn: () => apiGet<Draft>(`/api/ai-import/${id}`) });
  const d = q.data;
  const running = useRef(false);

  // Reading continues in the background (and shows in the header) if the page is left.
  useEffect(() => {
    if (d?.status === "EXTRACTING") void driveImport(id, d.detected?.shortTitle || d.fileName, qc, d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.status, id, qc]);

  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.error || !d) return <Card><ErrorState error={q.error} onRetry={q.refetch} /></Card>;
  const det = d.detected;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>← All AI imports</Button>
        <span className="text-[13px] font-semibold text-fg">{det?.shortTitle || d.fileName}</span>
        <Badge tone={STATUS[d.status]?.tone ?? "neutral"}>{STATUS[d.status]?.label ?? d.status}</Badge>
        <span className="text-xs text-muted">{d.fileName} · {d.pages} pages · uploaded by {d.createdBy} {formatDateTime(d.createdAt)}</span>
      </div>

      {d.status === "EXTRACTING" && (
        <Card>
          <CardBody>
            <div className="mb-2 flex items-center gap-2 text-[13px] text-fg"><Loader2 className="size-4 animate-spin text-accent" /> Reading sections: part {Math.min(d.chunksDone + 1, d.chunks)} of {d.chunks}</div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[var(--chart-1)] transition-all" style={{ width: `${(d.chunksDone / Math.max(1, d.chunks)) * 100}%` }} /></div>
            <p className="mt-2 text-xs text-muted">You can leave this page; progress shows in the header and you will be notified when it is done. Each part takes up to a minute.</p>
          </CardBody>
        </Card>
      )}
      {d.status === "FAILED" && <Card><CardBody className="flex items-start gap-2 text-[13px]"><XCircle className="mt-0.5 size-4 text-danger" /><div><div className="font-semibold text-fg">Reading failed</div><div className="text-muted">{d.error}</div></div></CardBody></Card>}

      {det && (
        <Card>
          <CardHeader title="Identified document" description="Read by AI from the opening pages; check before publishing" icon={<Bot />} />
          <CardBody className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
            {([["Title", det.title], ["Publisher", det.publisher], ["Version", det.version], ["Published", det.publishedDate], ["Document type", det.documentType], ["Jurisdiction", det.jurisdiction]] as const).map(([k, v]) => (
              <div key={k}><div className="text-[11px] text-muted">{k}</div><div className="text-fg">{v || <span className="text-subtle">Not stated</span>}</div></div>
            ))}
            <div className="sm:col-span-2 xl:col-span-3">
              <div className="text-[11px] text-muted">Match in the library</div>
              <div className="text-fg">
                {d.matchKind === "SAME_VERSION" && d.match ? <>Same version as <Link href={`/sources/${d.match.id}`} className="text-accent hover:underline">{d.match.name}</Link></>
                  : d.matchKind === "NEW_VERSION" && d.match ? <>New version of <Link href={`/sources/${d.match.id}`} className="text-accent hover:underline">{d.match.name}</Link> (library has {d.match.versionLabel ?? "an earlier version"})</>
                  : "Not in the library: a new document"}
              </div>
              {det.notes && <div className="mt-1 text-xs text-muted">AI note: {det.notes}</div>}
            </div>
          </CardBody>
        </Card>
      )}

      {(d.status === "READY" || d.status === "PUBLISHED") && (det as unknown as { quality?: Quality })?.quality && <QualityCard q={(det as unknown as { quality: Quality }).quality} checks={(det as unknown as { checks?: Record<string, unknown> }).checks} />}
      {(d.status === "READY" || d.status === "PUBLISHED") && <Review d={d} onDone={() => { qc.invalidateQueries({ queryKey: ["ai-import", id] }); qc.invalidateQueries({ queryKey: ["ai-imports"] }); qc.invalidateQueries(); router.refresh(); }} />}

      {d.usage && <p className="text-[11px] text-subtle">AI usage: {d.usage.calls} calls · {formatNumber(d.usage.input)} input and {formatNumber(d.usage.output)} output tokens · model {d.model}</p>}
    </div>
  );
}

function Review({ d, onDone }: { d: Draft; onDone: () => void }) {
  const [filter, setFilter] = useState<"all" | "unverified" | "excluded">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(d.matchKind ?? "NEW_DOCUMENT");
  const [sourceId, setSourceId] = useState(d.suggestedSourceId);
  const [name, setName] = useState(d.detected?.title ?? "");
  const [version, setVersion] = useState((d.detected?.libraryVersion ?? d.detected?.version)?.match(/\d+(?:\.\d+)*/)?.[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [include, setInclude] = useState<Record<string, boolean>>(() => Object.fromEntries(d.sections.map((s) => [s.id, s.include])));
  const editable = d.status === "READY";

  const sections = useMemo(() => d.sections.filter((s) => filter === "all" || (filter === "unverified" ? !s.verified : !include[s.id])), [d.sections, filter, include]);
  const verified = d.sections.filter((s) => s.verified).length;
  const toPublish = d.sections.filter((s) => s.verified && include[s.id]).length;

  const toggle = async (ids: string[], v: boolean) => {
    setInclude((m) => ({ ...m, ...Object.fromEntries(ids.map((i) => [i, v])) }));
    try { await apiSend(`/api/ai-import/${d.id}`, { include: ids.map((i) => ({ id: i, include: v })) }, "PATCH"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  };
  const [note, setNote] = useState("");
  const [types, setTypes] = useState<Record<string, string>>(() => Object.fromEntries(d.sections.map((s) => [s.id, s.contentType ?? ""])));
  const setType = async (id: string, contentType: string) => {
    setTypes((m) => ({ ...m, [id]: contentType }));
    try { await apiSend(`/api/ai-import/${d.id}`, { types: [{ id, contentType }] }, "PATCH"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  };
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); } finally { setBusy(false); }
  };
  const publish = () => action(async () => {
    const body = mode === "SAME_VERSION" ? { mode, targetFrameworkId: d.match?.id, note: note || undefined } : { mode, parentSourceId: sourceId, name, versionLabel: version, note: note || undefined };
    const r = await apiSend<{ frameworkId: string; added: number; updated: number; proposals?: number; check?: { status: string; latestVersion: string | null; message: string | null } | null }>(`/api/ai-import/${d.id}/publish`, body);
    toast.success(`Approved and published: ${r.added} added, ${r.updated} updated${r.proposals ? ` · ${r.proposals} client mapping suggestion(s) created` : ""}`);
    // The publisher was checked right after publishing: say plainly whether the library is now current.
    if (r.check?.status === "UP_TO_DATE") toast.success("The library is now up to date with the publisher", { description: r.check.message ?? undefined });
    else if (r.check?.status === "UPDATE_AVAILABLE") toast.warning(`A newer version is still available: ${r.check.latestVersion ?? ""}`, { description: r.check.message ?? undefined });
    else if (r.check) toast.info("Could not confirm with the publisher that this is the latest version", { description: r.check.message ?? undefined });
    onDone();
  });
  const discard = () => action(async () => { await apiSend(`/api/ai-import/${d.id}`, { note: note || undefined }, "DELETE"); toast.success("Rejected"); onDone(); });
  const reprocess = () => action(async () => { await apiSend(`/api/ai-import/${d.id}/reprocess`); toast.success("Comparison and summary run again"); onDone(); });
  const revert = () => action(async () => { await apiSend(`/api/ai-import/${d.id}/revert`); toast.success("Publication reverted; the previous version remains current"); onDone(); });

  const c = d.comparison?.summary;
  return (
    <>
      <StatStrip
        className="xl:grid-cols-4"
        items={[
          { label: "Sections found", value: d.sections.length },
          { label: "Verified in the document", value: verified, tone: verified === d.sections.length ? "success" : "warning", hint: "Start and end of the text were found word for word in the file" },
          { label: "Not verified", value: d.sections.length - verified, tone: verified < d.sections.length ? "warning" : "default", hint: "Cannot be published until checked; excluded by default" },
          { label: "Selected to publish", value: toPublish },
        ]}
      />

      {d.comparison && c && (
        <Card>
          <CardHeader title={`Compared with ${d.comparison.base.short}`} description="Computed comparison (not AI): identifiers first, then wording similarity for renumbered, split and combined sections" />
          <CardBody className="space-y-3">
            {d.relationCounts && (
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(d.relationCounts).filter(([, n]) => n > 0).map(([k, n]) => <Badge key={k} tone={k === "REMOVED" ? "danger" : k === "UNCHANGED" ? "success" : k === "ADDED" ? "info" : "warning"}>{n} {k.toLowerCase()}</Badge>)}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="success">{c.added} new</Badge><Badge tone="danger">{c.removed} not in this file</Badge><Badge tone="info">{c.changed} reworded</Badge><Badge>{c.unchanged} unchanged</Badge>
              {c.domainsAdded.length > 0 && <Badge tone="success">New domain: {c.domainsAdded.join(", ")}</Badge>}
            </div>
            {d.summary && (
              <div className="rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Bot className="size-3.5" /> AI-generated change summary · verify before relying on it</div>
                <p className="whitespace-pre-line text-[13px] text-fg-2">{d.summary}</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          {(["all", "unverified", "excluded"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md border px-2 py-1 text-xs", filter === f ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>
              {f === "all" ? `All ${d.sections.length}` : f === "unverified" ? `Not verified ${d.sections.length - verified}` : `Excluded ${d.sections.filter((s) => !include[s.id]).length}`}
            </button>
          ))}
          {editable && (
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggle(d.sections.filter((s) => s.verified).map((s) => s.id), true)}>Include all verified</Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(d.sections.map((s) => s.id), false)}>Exclude all</Button>
            </span>
          )}
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="w-10 px-3 py-2">Use</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Under</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Check</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={!!include[s.id] && s.verified} disabled={!editable || !s.verified} onChange={(e) => toggle([s.id], e.target.checked)} aria-label={`Include ${s.identifier}`} className="size-4 accent-[var(--chart-1)]" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} className="text-left">
                      <Mono className="font-medium text-fg">{s.identifier}</Mono> {s.title && <span className="text-fg-2">{s.title}</span>}
                      <div className={cn("whitespace-pre-line text-muted", open === s.id ? "" : "line-clamp-2")}>{s.text || <span className="text-warning">Text could not be located in the file.</span>}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted">{s.path.join(" › ") || "—"}</td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <select value={types[s.id] ?? ""} onChange={(e) => setType(s.id, e.target.value)} aria-label={`Content type of ${s.identifier}`} className="rounded border border-border bg-surface px-1 py-0.5 text-[11px] text-fg-2">
                        {["REQUIREMENT", "RECOMMENDATION", "GUIDANCE", "DEFINITION", "EXAMPLE", "REFERENCE", "SECTION"].map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
                      </select>
                    ) : <Badge tone={s.contentType === "REQUIREMENT" ? "accent" : "outline"}>{(s.contentType ?? "—").toLowerCase()}</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted">{s.pageNumber ? `p. ${s.pageNumber}` : s.sheetName ? `${s.sheetName}!R${s.rowNumber}` : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{s.verified ? <Badge tone="success"><CheckCircle2 /> Verified</Badge> : <Badge tone="warning"><ShieldAlert /> Not verified</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sections.length && <p className="px-4 py-6 text-center text-xs text-muted">No sections in this view.</p>}
        </div>
      </Card>

      {d.status === "PUBLISHED" ? (
        <Card><CardBody className="flex flex-wrap items-center gap-3 text-[13px]"><CheckCircle2 className="size-4 text-success" /> Approved and published by {d.reviewedBy}. {d.publishedFrameworkId && <Button asChild size="sm"><Link href={`/sources/${d.publishedFrameworkId}`}>Open in Sources <ArrowRight /></Link></Button>} <Button asChild size="sm"><Link href={`/change-analytics?update=${d.id}`}>Open in Change Analytics <ArrowRight /></Link></Button> {d.matchKind !== "SAME_VERSION" && <Button size="sm" variant="ghost" disabled={busy} onClick={revert}>Revert publication</Button>}</CardBody></Card>
      ) : (
        <Card>
          <CardHeader title="Publish to the document library" description="Adds and updates only; nothing is deleted. Recorded in the audit log." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={mode} onChange={(v) => setMode(v as Mode)} options={(Object.keys(MODE) as Mode[]).filter((m) => m !== "SAME_VERSION" || d.match).filter((m) => m !== "NEW_VERSION" || d.match).map((m) => ({ value: m, label: MODE[m].label }))} triggerClassName="min-w-[260px]" aria-label="Publish as" />
              <span className="text-xs text-muted">{MODE[mode].hint}</span>
            </div>
            {mode !== "SAME_VERSION" && (
              <div className="grid gap-3 sm:grid-cols-[160px_1fr_140px]">
                <label className="text-xs text-muted">Parent Source ID<Input value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="mt-1" /></label>
                <label className="text-xs text-muted">Document name<Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></label>
                <label className="text-xs text-muted">Version<Input value={version} onChange={(e) => setVersion(e.target.value)} className="mt-1" /></label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy || !toPublish} onClick={publish}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Publish {toPublish} section{toPublish === 1 ? "" : "s"}</Button>
              <Button disabled={busy} onClick={discard}><Trash2 /> Reject</Button>
              <Button disabled={busy} variant="ghost" onClick={reprocess}>Request reprocessing</Button>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review comment (recorded with the decision)" className="min-w-[260px] flex-1" aria-label="Review comment" />
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function QualityCard({ q, checks }: { q: Quality; checks?: Record<string, unknown> }) {
  return (
    <Card>
      <CardHeader title="Extraction quality" description="Checked before anything can be approved" icon={q.warnings.length ? <ShieldAlert /> : <CheckCircle2 />} />
      <CardBody className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-2">
          <Badge>{q.sections} sections</Badge>
          <Badge tone={q.unverified ? "warning" : "success"}>{q.verified} verified against the source</Badge>
          {Object.entries(q.byContentType).map(([k, v]) => <Badge key={k} tone="outline">{v} {k.toLowerCase()}</Badge>)}
          <Badge tone="outline">{q.partsProcessed === "structured" ? `${q.pagesOrSheets} worksheet(s), structured` : `${q.partsProcessed} parts of ${q.pagesOrSheets} pages`}</Badge>
          {q.ocr && <Badge tone="warning">OCR</Badge>}
        </div>
        {checks && "expectedVersion" in checks && (
          <div className="text-fg-2">Expected version <b>{String(checks.expectedVersion)}</b>: {checks.versionMatchesExpected ? <span className="text-success">matches the document</span> : <span className="text-warning">not confirmed by the document</span>}</div>
        )}
        {q.warnings.length ? (
          <ul className="list-disc space-y-0.5 pl-5 text-warning">{q.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        ) : <p className="text-success">No quality issues found.</p>}
      </CardBody>
    </Card>
  );
}
