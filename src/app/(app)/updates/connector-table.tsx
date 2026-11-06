"use client";
import { CheckCircle2, CircleDashed, Download, ExternalLink, History, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ErrorState, Mono, TableSkeleton } from "@/components/common";
import { formatDateTime, formatRelative } from "@/lib/utils";

export interface ConnectorRow {
  id: string; name: string; sourceName: string; publisher: string; mechanism: string; mechanismLabel: string; description: string;
  officialUrl: string; endpointUrl: string; pollingMinutes: number; enabled: boolean; currentVersion: string | null;
  lastCheckedAt: string | null; lastSuccessAt: string | null; lastStatus: string | null; lastError: string | null;
  framework: { id: string; short: string; versionLabel: string | null } | null;
  lastCheck: { status: string; detectedVersion: string | null; message: string | null; httpStatus: number | null; durationMs: number | null } | null;
  openUpdates: number; totalChecks: number; nextCheckAt: string | null;
  /** The publisher provides the framework as data, so this connector can download a new version in full. */
  fetchesContent: boolean;
}

/** The connector's state. "N to review" is a button that opens those findings in the Update centre below. */
function Status({ c, onReview }: { c: ConnectorRow; onReview: (id: string) => void }) {
  if (!c.lastCheckedAt) return <span className="flex items-center gap-1.5 text-xs text-muted"><CircleDashed className="size-3.5" /> Not checked</span>;
  if (c.lastStatus === "ERROR")
    return <Tooltip content={c.lastError}><span className="flex items-center gap-1.5 text-xs text-danger"><XCircle className="size-3.5" /> Error</span></Tooltip>;
  if (c.openUpdates)
    return (
      <button
        onClick={() => onReview(c.id)} title="Show these findings below"
        className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-xs font-medium text-warning transition-colors hover:brightness-95"
      >
        <TriangleAlert className="size-3.5" /> {c.openUpdates} to review
      </button>
    );
  return <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> Connected</span>;
}

const freq = (m: number) => (m % 1440 === 0 ? (m === 1440 ? "Daily" : `Every ${m / 1440} days`) : m % 60 === 0 ? `Every ${m / 60} h` : `Every ${m} min`);

export function ConnectorTable({
  items, also = {}, loading, error, running, canWrite, onCheck, onSync, onHistory, onReview, onGetVersion,
}: {
  items: ConnectorRow[]; also?: Record<string, ConnectorRow[]>; loading: boolean; error: unknown; running: string[]; canWrite: boolean;
  onCheck: (id: string) => void; onSync: (id: string) => void; onHistory: (id: string) => void; onReview: (id: string) => void; onGetVersion: (id: string) => void;
}) {
  return (
    <Card>
      <table className="w-full table-fixed text-left">
        <colgroup><col className="w-[34%]" /><col className="w-[24%]" /><col className="w-[17%]" /><col className="w-[11%]" /><col className="w-[14%]" /></colgroup>
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
            const versionDiff = detected && c.currentVersion && detected !== c.currentVersion;
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
                    <div key={x.id} className="mt-1.5 text-[11px] text-muted">Also watches: <span className="text-fg-2">{x.sourceName}</span></div>
                  ))}
                </td>
                <td className="px-3 py-3">
                  <Status c={c} onReview={onReview} />
                  {c.lastStatus === "ERROR" && <div className="mt-1 line-clamp-2 text-[11px] text-danger">{c.lastError}</div>}
                  {c.lastCheck?.message && c.lastStatus !== "ERROR" && <div className="mt-1 line-clamp-2 text-[11px] text-muted" title={c.lastCheck.message}>{c.lastCheck.message}</div>}
                </td>
                <td className="px-3 py-3 text-xs">
                  <div className="text-muted">Current</div>
                  <Mono className="break-all text-[11px]">{c.currentVersion ?? "—"}</Mono>
                  {versionDiff && <><div className="mt-1 text-muted">Detected</div><Mono className="break-all text-[11px] text-warning">{detected}</Mono></>}
                </td>
                <td className="px-3 py-3 text-xs text-fg-2">
                  <Tooltip content={formatDateTime(c.lastCheckedAt)}><span>{formatRelative(c.lastCheckedAt)}</span></Tooltip>
                  <div className="text-[11px] text-subtle">{freq(c.pollingMinutes)}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" disabled={!canWrite || busy} onClick={() => onCheck(c.id)}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check</Button>
                    {c.fetchesContent && (
                      <Tooltip content="Download the newest version from the publisher and prepare it as an update in Sources">
                        <Button size="sm" disabled={!canWrite || busy} onClick={() => onGetVersion(c.id)}><Download /> Get new version</Button>
                      </Tooltip>
                    )}
                    <Tooltip content={versionDiff ? `Adopt ${detected} as the current version` : "Adopt the latest detected state as baseline"}>
                      <Button size="sm" variant={versionDiff ? "primary" : "ghost"} disabled={!canWrite || !c.lastCheck || c.lastStatus === "ERROR"} onClick={() => onSync(c.id)}>Sync</Button>
                    </Tooltip>
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
