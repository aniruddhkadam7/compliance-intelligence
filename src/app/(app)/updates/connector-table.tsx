"use client";
import Link from "next/link";
import { ArrowUpCircle, CheckCircle2, CircleDashed, Download, ExternalLink, History, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ErrorState, TableSkeleton } from "@/components/common";
import { connectorStatus, isOverdue } from "@/lib/connectors/status";
import { formatDateTime, formatRelative } from "@/lib/utils";

export interface ConnectorRow {
  id: string; name: string; sourceName: string; publisher: string; mechanism: string; mechanismLabel: string; description: string;
  officialUrl: string; endpointUrl: string; pollingMinutes: number; enabled: boolean;
  /** The connector's own acknowledged baseline (raw identifier); set on the first check and by Sync. */
  currentVersion: string | null;
  lastCheckedAt: string | null; lastSuccessAt: string | null; lastStatus: string | null; lastError: string | null;
  framework: { id: string; short: string; versionLabel: string | null } | null;
  /** The version the platform uses. */
  library: { version: string | null; label: string | null };
  /** What the publisher's last successful response reported, and whether it is newer than the library's. */
  latest: { version: string | null; label: string | null; newer: boolean; inSources: boolean };
  lastCheck: { status: string; detectedVersion: string | null; message: string | null; httpStatus: number | null; durationMs: number | null; checkedAt: string; summary: string | null } | null;
  openUpdates: number; totalChecks: number; nextCheckAt: string | null;
  /** The publisher provides the framework as data, so this connector can download a new version in full. */
  fetchesContent: boolean;
  /** Watches a demo framework: `version` is the one the demo is on, `newer` the update still offered in Sources. */
  demo: { version: string; newer: string | null; applied: boolean } | null;
}

const pill = "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:brightness-95";

/** The connector's single status, with one line that explains it. */
function Status({ c }: { c: ConnectorRow }) {
  const kind = connectorStatus({ lastCheckedAt: c.lastCheckedAt, lastStatus: c.lastStatus, publisherNewer: c.latest.newer });

  if (kind === "NOT_CHECKED") return <span className="flex items-center gap-1.5 text-xs text-muted"><CircleDashed className="size-3.5" /> Not checked yet</span>;
  if (kind === "ERROR")
    return (
      <div className="space-y-1">
        <span className="flex items-center gap-1.5 text-xs text-danger"><XCircle className="size-3.5" /> Check failed</span>
        <div className="line-clamp-2 text-[11px] text-danger" title={c.lastError ?? undefined}>{c.lastError}</div>
        <div className="text-[11px] text-muted">Last successful check: {formatRelative(c.lastSuccessAt)}</div>
      </div>
    );
  if (kind === "UPDATE_AVAILABLE") {
    const { inSources } = c.latest;
    const badge = <><ArrowUpCircle className="size-3.5" /> Update available</>;
    return (
      <div className="space-y-1">
        {inSources
          ? <Link href="/sources" title="Install it with Update in Sources" className={`${pill} bg-warning-soft text-warning`}>{badge}</Link>
          : <span className={`${pill} bg-warning-soft text-warning hover:brightness-100`}>{badge}</span>}
        <div className="text-[11px] text-muted">
          {c.publisher} publishes <span className="text-fg-2">{c.latest.label}</span>; the platform uses <span className="text-fg-2">{c.library.label}</span>.
          {" "}{inSources ? "Install it in Sources." : c.fetchesContent ? "Use Get new version to prepare it." : "Upload it in the Admin Console."}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> Up to date</span>
      <div className="text-[11px] text-muted">
        {c.latest.version ? "The platform uses the publisher's latest version." : "No version is published as data; the official file is watched for changes."}
      </div>
    </div>
  );
}

const freq = (m: number) => (m % 1440 === 0 ? (m === 1440 ? "Daily" : `Every ${m / 1440} days`) : m % 60 === 0 ? `Every ${m / 60} h` : `Every ${m} min`);

/** When the connector last reached the publisher, what the response was, and whether scheduled checks are behind. */
function LastChecked({ c }: { c: ConnectorRow }) {
  const overdue = c.enabled && isOverdue(c.lastCheckedAt, c.pollingMinutes);
  return (
    <div className="space-y-0.5">
      <Tooltip content={c.lastCheckedAt ? formatDateTime(c.lastCheckedAt) : "This connector has not run yet"}><span className="text-fg-2">{formatRelative(c.lastCheckedAt)}</span></Tooltip>
      {c.lastCheck?.summary && c.lastStatus !== "ERROR" && <div className="text-[11px] text-muted" title={c.lastCheck.message ?? undefined}>{c.lastCheck.summary}</div>}
      <Tooltip content={overdue ? `Scheduled checks run ${freq(c.pollingMinutes).toLowerCase()}; this source has not been checked since ${formatDateTime(c.lastCheckedAt)}.` : `Checked automatically, ${freq(c.pollingMinutes).toLowerCase()}`}>
        <div className={`text-[11px] ${overdue ? "text-warning" : "text-subtle"}`}>{freq(c.pollingMinutes)}{overdue && " · overdue"}</div>
      </Tooltip>
    </div>
  );
}

export function ConnectorTable({
  items, also = {}, loading, error, running, canWrite, onCheck, onSync, onHistory, onGetVersion,
}: {
  items: ConnectorRow[]; also?: Record<string, ConnectorRow[]>; loading: boolean; error: unknown; running: string[]; canWrite: boolean;
  onCheck: (id: string) => void; onSync: (id: string) => void; onHistory: (id: string) => void; onGetVersion: (id: string) => void;
}) {
  return (
    <Card>
      <table className="w-full table-fixed text-left">
        <colgroup><col className="w-[30%]" /><col className="w-[26%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[14%]" /></colgroup>
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="px-4 py-2">Connector</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Version</th>
            <th className="px-3 py-2">Last checked</th><th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const busy = [c.id, ...(also[c.id] ?? []).map((x) => x.id)].some((id) => running.includes(id));
            const detected = c.lastCheck?.detectedVersion;
            // Sync adopts the publisher's version as this connector's baseline; a demo framework's version is set in Sources.
            const syncDiff = !c.demo && !!detected && !!c.currentVersion && detected !== c.currentVersion;
            return (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-fg">{c.name}</div>
                  <div className="text-[11px] text-muted">{c.sourceName} · {c.publisher}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <Tooltip content={c.mechanismLabel}><Badge tone={c.mechanism === "HTTP_FINGERPRINT" ? "outline" : "info"}>{c.mechanism.replace("_", " ").toLowerCase()}</Badge></Tooltip>
                    <a href={c.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-accent">Official source <ExternalLink className="size-3" /></a>
                  </div>
                  {(also[c.id] ?? []).map((x) => (
                    <div key={x.id} className="mt-1.5 text-[11px] text-muted">
                      Also watches: <span className="text-fg-2">{x.sourceName}</span>
                      <div className={x.lastStatus === "ERROR" ? "text-danger" : "text-subtle"}>
                        {x.lastStatus === "ERROR" ? `Check failed: ${x.lastError}` : x.lastCheck?.summary ?? "Not checked yet"}
                        {x.lastCheckedAt && <Tooltip content={formatDateTime(x.lastCheckedAt)}><span> · {formatRelative(x.lastCheckedAt)}</span></Tooltip>}
                      </div>
                    </div>
                  ))}
                </td>
                <td className="px-3 py-3"><Status c={c} /></td>
                <td className="px-3 py-3 text-xs">
                  <div className="text-[11px] text-muted">In use</div>
                  <div className="text-fg">{c.library.label ?? "—"}</div>
                  <div className="mt-1.5 text-[11px] text-muted">Latest</div>
                  <Tooltip content={c.latest.version && c.latest.version !== c.latest.label ? `Identifier: ${c.latest.version}` : null}>
                    <div className={c.latest.newer ? "text-warning" : "text-fg"}>{c.latest.label ?? "—"}</div>
                  </Tooltip>
                </td>
                <td className="px-3 py-3 text-xs"><LastChecked c={c} /></td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" disabled={!canWrite || busy} onClick={() => onCheck(c.id)}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check</Button>
                    {c.fetchesContent && (
                      <Tooltip content="Download the newest version from the publisher and prepare it as an update in Sources">
                        <Button size="sm" disabled={!canWrite || busy} onClick={() => onGetVersion(c.id)}><Download /> Get new version</Button>
                      </Tooltip>
                    )}
                    {c.demo ? (
                      c.demo.newer && <Button size="sm" variant="primary" asChild><Link href="/sources">Update in Sources</Link></Button>
                    ) : (
                      <Tooltip content={syncDiff ? `Adopt ${c.latest.label} as this connector's baseline (the library and mappings are not changed)` : "Adopt the latest check as this connector's baseline"}>
                        <Button size="sm" variant={syncDiff ? "primary" : "ghost"} disabled={!canWrite || !c.lastCheck || c.lastStatus === "ERROR"} onClick={() => onSync(c.id)}>Sync</Button>
                      </Tooltip>
                    )}
                    <Button size="icon-sm" variant="ghost" onClick={() => onHistory(c.id)} aria-label="Check history"><History /></Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && <TableSkeleton rows={4} cols={5} />}
      {!!error && <ErrorState error={error} />}
    </Card>
  );
}
