"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Eye, History, Loader2, RotateCcw, Send, Undo2, Upload } from "lucide-react";
import { EmptyState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client/api";
import { UPDATE_CHECK } from "@/lib/updates/labels";
import { cn, formatNumber, formatRelative } from "@/lib/utils";
import type { SourceRow } from "@/lib/queries/sources";

export interface DraftQuality { fileName: string; sections: number; unverified: number; warnings: string[] }
/** A newer version already in the library that users can install from Sources once an admin releases it. */
export interface ReleaseRow { key: string; family: string; previous: string; current: string; previousId: string; currentId: string; status: "AVAILABLE" | "UPDATED" | "REJECTED"; released: boolean }

type Stage = "UPLOAD" | "RELEASE" | "RELEASED" | "CURRENT";
const stageOf = (d: SourceRow): Stage =>
  d.pendingImport ? (d.pendingImport.released ? "RELEASED" : "RELEASE") : d.latestCheck?.status === "UPDATE_AVAILABLE" ? "UPLOAD" : "CURRENT";

/** Admin console: upload new official versions, check them, and release them to users as an "Update" button. */
export function AdminConsole({ docs, quality, releases }: { docs: SourceRow[]; quality: Record<string, DraftQuality>; releases: ReleaseRow[] }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Newer versions already in the library and not installed by users yet: one row each, in place of the document's own row.
  const pending = releases.filter((r) => r.status !== "UPDATED");
  const covered = new Set(pending.flatMap((r) => [r.previousId, r.currentId]));
  // One row per document: the latest version in the library.
  const latest = docs.filter((d) => !covered.has(d.id) && (d.familyVersions.at(-1)?.id === d.id || !d.familyVersions.length));
  const libStage = (r: ReleaseRow): Stage => (r.status === "REJECTED" ? "CURRENT" : r.released ? "RELEASED" : "RELEASE");
  const count = (s: Stage) => latest.filter((d) => stageOf(d) === s).length + pending.filter((r) => libStage(r) === s).length;
  const ORDER = ["RELEASE", "UPLOAD", "RELEASED", "CURRENT"];
  type Item = { stage: Stage; lib?: ReleaseRow; d?: SourceRow };
  const rows = [...pending.map((r): Item => ({ lib: r, stage: libStage(r) })), ...latest.map((d): Item => ({ d, stage: stageOf(d) }))]
    .filter((x) => all || x.stage !== "CURRENT")
    .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage));
  const total = latest.length + pending.length;

  const releaseLib = async (r: ReleaseRow, released: boolean) => {
    setBusy(r.key);
    try {
      await apiSend("/api/demo", { action: "release", keys: [r.key], released });
      toast.success(released ? `${r.family} ${r.current}: released. Users now see the update in Sources.` : `${r.family} ${r.current}: release withdrawn`);
      qc.invalidateQueries();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally { setBusy(null); }
  };

  const release = async (d: SourceRow, released: boolean) => {
    setBusy(d.id);
    try {
      await apiSend(`/api/ai-import/${d.pendingImport!.id}/release`, { released });
      toast.success(released ? `${d.short}: released. Users now see an Update button.` : `${d.short}: release withdrawn`);
      qc.invalidateQueries();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally { setBusy(null); }
  };

  return (
    <Page>
      <PageHeader
        title="Admin Console"
        description="Keep the document library current: upload the new official version when one is available, check the extraction, then release it. Users then see a single Update button on the document."
        actions={<RollbackButton />}
      />
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "1. Upload needed", value: count("UPLOAD"), tone: count("UPLOAD") ? "warning" : "default", sub: "Newer version at the publisher" },
          { label: "2. Ready to release", value: count("RELEASE"), tone: count("RELEASE") ? "warning" : "default", sub: "New version in the library, awaiting your check" },
          { label: "3. Released to users", value: count("RELEASED"), sub: "Update button shown" },
          { label: "Up to date", value: count("CURRENT"), sub: `of ${total} documents` },
        ]}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted">
          <span className="flex-1">{all ? `All ${total} documents` : `${rows.length} document(s) need action`}</span>
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
                {rows.map((x) => {
                  if (x.lib) {
                    const r = x.lib;
                    return (
                      <tr key={r.key} className="border-b border-border align-top">
                        <td className="min-w-[200px] px-4 py-3">
                          <Link href={`/sources/${r.previousId}`} className="font-medium text-fg hover:text-accent hover:underline">{r.family}</Link>
                          <div className="text-[11px] text-muted">Both versions are in the library</div>
                        </td>
                        <td className="px-3 py-3 text-xs"><Mono>{r.previous}</Mono></td>
                        <td className="px-3 py-3 text-xs"><div className="font-semibold text-warning">{r.current}</div><div className="mt-0.5 text-[11px] text-muted">Already in the library</div></td>
                        <td className="px-3 py-3 text-xs">
                          {x.stage === "RELEASE" && <><div className="text-fg">Version {r.current} ready</div><div className="text-[11px] text-muted">Users do not see it yet</div></>}
                          {x.stage === "RELEASED" && <><div className="text-fg">Version {r.current} released</div><div className="text-[11px] text-muted">Users see the update in Sources</div></>}
                          {r.status === "REJECTED" && <span className="text-muted">Rejected by users in Sources</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1.5">
                            <Button asChild size="sm"><Link href={`/sources/${r.currentId}`}><Eye /> Review</Link></Button>
                            {x.stage === "RELEASE" && <Button size="sm" variant="primary" disabled={busy === r.key} onClick={() => releaseLib(r, true)}>{busy === r.key ? <Loader2 className="animate-spin" /> : <Send />} Release to users</Button>}
                            {x.stage === "RELEASED" && <Button size="sm" variant="ghost" disabled={busy === r.key} onClick={() => releaseLib(r, false)}><Undo2 /> Withdraw</Button>}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  const d = x.d!;
                  const c = d.latestCheck, st = UPDATE_CHECK[c?.status ?? "NOT_CHECKED"], stage = x.stage;
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
      <PreviousVersionRecords />
    </Page>
  );
}

/**
 * Rollback to the demo-ready state: every framework update offered again in Sources, nothing approved in Change
 * Analytics, and the client's controls removed so they can be uploaded again.
 */
function RollbackButton() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await apiSend("/api/demo", { action: "rollback" });
      toast.success("Rolled back to the demo-ready state");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
      setBusy(false);
    }
  };
  if (!confirming) return <Button variant="primary" onClick={() => setConfirming(true)}><RotateCcw /> Rollback</Button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-fg-2">Restore the demo-ready state? Updates, approvals and uploaded client controls are cleared.</span>
      <Button variant="primary" disabled={busy} onClick={run}>{busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Confirm rollback</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
    </span>
  );
}

/** Researched previous-version records (version replaced, publisher facts, official source): fills empty fields only. */
function PreviousVersionRecords() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await apiSend<{ changes: { sourceId: string; name: string }[] }>("/api/admin/previous-versions", { apply: true });
      toast.success(r.changes.length ? `Previous-version records filled for ${r.changes.length} document(s)` : "All previous-version records are already filled");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally { setBusy(false); }
  };
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="font-medium text-fg">Previous-version records</div>
        <div className="text-xs text-muted">The version each document replaced, with the publisher facts and official source, shown in Sources and the Source Document Library. Fills empty records only; existing values are never overwritten.</div>
      </div>
      <Button size="sm" disabled={busy} onClick={run}>{busy ? <Loader2 className="animate-spin" /> : <History />} Fill missing records</Button>
    </Card>
  );
}
