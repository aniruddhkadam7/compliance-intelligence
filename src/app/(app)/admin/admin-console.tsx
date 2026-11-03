"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Eye, Loader2, RefreshCw, Send, Undo2, Upload } from "lucide-react";
import { EmptyState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client/api";
import { UPDATE_CHECK } from "@/lib/updates/labels";
import { cn, formatNumber, formatRelative } from "@/lib/utils";
import type { SourceRow } from "@/lib/queries/sources";
import { useCheckForUpdates } from "../sources/sources-catalog";

export interface DraftQuality { fileName: string; sections: number; unverified: number; warnings: string[] }

type Stage = "UPLOAD" | "RELEASE" | "RELEASED" | "CURRENT";
const stageOf = (d: SourceRow): Stage =>
  d.pendingImport ? (d.pendingImport.released ? "RELEASED" : "RELEASE") : d.latestCheck?.status === "UPDATE_AVAILABLE" ? "UPLOAD" : "CURRENT";

/** Admin console: upload new official versions, check them, and release them to users as an "Update" button. */
export function AdminConsole({ docs, quality }: { docs: SourceRow[]; quality: Record<string, DraftQuality> }) {
  const router = useRouter();
  const { run, running } = useCheckForUpdates();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // One row per document: the latest version in the library.
  const latest = useMemo(() => docs.filter((d) => d.familyVersions.at(-1)?.id === d.id || !d.familyVersions.length), [docs]);
  const count = (s: Stage) => latest.filter((d) => stageOf(d) === s).length;
  const rows = latest.filter((d) => all || stageOf(d) !== "CURRENT")
    .sort((a, b) => ["RELEASE", "UPLOAD", "RELEASED", "CURRENT"].indexOf(stageOf(a)) - ["RELEASE", "UPLOAD", "RELEASED", "CURRENT"].indexOf(stageOf(b)));

  const release = async (d: SourceRow, released: boolean) => {
    setBusy(d.id);
    try {
      await apiSend(`/api/ai-import/${d.pendingImport!.id}/release`, { released });
      toast.success(released ? `${d.short}: released. Users now see an Update button.` : `${d.short}: release withdrawn`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally { setBusy(null); }
  };

  return (
    <Page>
      <PageHeader
        title="Admin console"
        description="Keep the document library current: upload the new official version when one is available, check the extraction, then release it. Users then see a single Update button on the document."
        actions={<Button variant="primary" disabled={!!running} onClick={() => run(latest.map((d) => ({ id: d.id, short: d.short })))}>{running ? <Loader2 className="animate-spin" /> : <RefreshCw />} {running ? `Checking ${running.done + 1} of ${running.total}…` : "Check all for updates"}</Button>}
      />
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "1. Upload needed", value: count("UPLOAD"), tone: count("UPLOAD") ? "warning" : "default", sub: "Newer version at the publisher" },
          { label: "2. Ready to release", value: count("RELEASE"), tone: count("RELEASE") ? "warning" : "default", sub: "Uploaded, awaiting your check" },
          { label: "3. Released to users", value: count("RELEASED"), sub: "Update button shown" },
          { label: "Up to date", value: count("CURRENT"), sub: `of ${latest.length} documents` },
        ]}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted">
          <span className="flex-1">{all ? `All ${latest.length} documents` : `${rows.length} document(s) need action`}</span>
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? "Show only those needing action" : "Show all documents"}</Button>
        </div>
        {!rows.length ? (
          <EmptyState icon={CheckCircle2} title="Nothing to do" description="Every document matches the latest version verified at its publisher. Run Check all for updates to verify again." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Document</th><th className="px-3 py-2">In library</th><th className="px-3 py-2">Latest at publisher</th>
                  <th className="px-3 py-2">Status</th><th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const c = d.latestCheck, st = UPDATE_CHECK[c?.status ?? "NOT_CHECKED"], stage = stageOf(d);
                  const q = d.pendingImport ? quality[d.pendingImport.id] : null;
                  return (
                    <tr key={d.id} className="border-b border-border align-top">
                      <td className="min-w-[200px] px-4 py-3">
                        <Link href={`/sources/${d.id}`} className="font-medium text-fg hover:text-accent hover:underline">{d.short}</Link>
                        <div className="text-[11px] text-muted">{d.publisher} · {formatNumber(d.obligations)} requirements</div>
                      </td>
                      <td className="px-3 py-3 text-xs">{d.version ? <Mono>{d.version}</Mono> : <span className="text-subtle">—</span>}</td>
                      <td className="px-3 py-3 text-xs">
                        <div className={cn(c?.status === "UPDATE_AVAILABLE" ? "font-semibold text-warning" : "text-fg-2")}>{c?.latestVersion ?? "—"}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted"><Dot tone={st.tone} />{st.label}{c && ` · ${formatRelative(c.checkedAt)}`}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {stage === "UPLOAD" && <span className="text-warning">Upload the new official version</span>}
                        {stage === "RELEASE" && q && <>
                          <div className="text-fg">Version {d.pendingImport!.version ?? "?"} uploaded {formatRelative(d.pendingImport!.uploadedAt)}</div>
                          <div className={cn("text-[11px]", q.unverified || q.warnings.length ? "text-warning" : "text-success")}>
                            {formatNumber(q.sections)} sections · {q.unverified ? `${q.unverified} not verified` : "all verified"}{q.warnings.length ? ` · ${q.warnings.length} warning(s)` : ""}
                          </div>
                        </>}
                        {stage === "RELEASED" && <><div className="text-fg">Version {d.pendingImport!.version ?? "?"} released</div><div className="text-[11px] text-muted">Users see the Update button</div></>}
                        {stage === "CURRENT" && <span className="text-muted">Up to date</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          {stage === "UPLOAD" && <Button asChild size="sm" variant="primary"><Link href={`/sources/${d.id}/upload?expected=${encodeURIComponent(c?.latestVersion ?? "")}`}><Upload /> Upload update</Link></Button>}
                          {(stage === "RELEASE" || stage === "RELEASED") && <Button asChild size="sm"><Link href={`/sources/${d.id}/upload?draft=${d.pendingImport!.id}`}><Eye /> Review</Link></Button>}
                          {stage === "RELEASE" && <Button size="sm" variant="primary" disabled={busy === d.id || !!q?.unverified} onClick={() => release(d, true)}>{busy === d.id ? <Loader2 className="animate-spin" /> : <Send />} Release to users</Button>}
                          {stage === "RELEASED" && <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => release(d, false)}><Undo2 /> Withdraw</Button>}
                          {stage === "CURRENT" && <Button asChild size="sm" variant="ghost"><Link href={`/sources/${d.id}/upload`}><Upload /> Upload new version</Link></Button>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[11px] text-subtle">
        Releasing does not change the library. A user clicks Update to install the new version; the previous version stays in the library, client mappings get change proposals, and the publisher is checked again.
      </p>
    </Page>
  );
}
