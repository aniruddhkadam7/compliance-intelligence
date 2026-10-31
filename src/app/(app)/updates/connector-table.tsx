"use client";
import Link from "next/link";
import { CheckCircle2, CircleDashed, ExternalLink, History, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
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
}

function Status({ c }: { c: ConnectorRow }) {
  if (!c.lastCheckedAt) return <span className="flex items-center gap-1.5 text-xs text-muted"><CircleDashed className="size-3.5" /> Not checked</span>;
  if (c.lastStatus === "ERROR")
    return <Tooltip content={c.lastError}><span className="flex items-center gap-1.5 text-xs text-danger"><XCircle className="size-3.5" /> Error</span></Tooltip>;
  if (c.openUpdates) return <span className="flex items-center gap-1.5 text-xs text-warning"><TriangleAlert className="size-3.5" /> {c.openUpdates} to review</span>;
  return <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> Connected</span>;
}

const freq = (m: number) => (m % 1440 === 0 ? (m === 1440 ? "Daily" : `Every ${m / 1440} days`) : m % 60 === 0 ? `Every ${m / 60} h` : `Every ${m} min`);

export function ConnectorTable({
  items, loading, error, running, canWrite, onCheck, onSync, onHistory,
}: {
  items: ConnectorRow[]; loading: boolean; error: unknown; running: string[]; canWrite: boolean;
  onCheck: (id: string) => void; onSync: (id: string) => void; onHistory: (id: string) => void;
}) {
  return (
    <Card>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">Connector</th><th className="px-3 py-2">Mechanism</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Last checked</th><th className="px-3 py-2">Last success</th><th className="px-3 py-2">Polling</th><th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const busy = running.includes(c.id);
              const detected = c.lastCheck?.detectedVersion;
              const versionDiff = detected && c.currentVersion && detected !== c.currentVersion;
              return (
                <tr key={c.id} className="border-b border-border align-top last:border-0">
                  <td className="min-w-[250px] max-w-[340px] px-4 py-3">
                    <div className="font-medium text-fg">{c.name}</div>
                    <div className="text-[11px] text-muted">{c.sourceName} · {c.publisher}</div>
                    {c.framework && <Link href={`/frameworks/${c.framework.id}`} className="mt-1 inline-block text-[11px] text-accent hover:underline">Workbook: {c.framework.short}</Link>}
                    <div className="mt-1 flex gap-3 whitespace-nowrap text-[11px]">
                      <a href={c.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-accent">Official source <ExternalLink className="size-3" /></a>
                      <Tooltip content={c.endpointUrl}><span className="cursor-help text-subtle">Endpoint</span></Tooltip>
                    </div>
                  </td>
                  <td className="min-w-[160px] max-w-[200px] px-3 py-3">
                    <Badge tone={c.mechanism === "HTTP_FINGERPRINT" ? "outline" : "info"}>{c.mechanism.replace("_", " ").toLowerCase()}</Badge>
                    <div className="mt-1 text-[11px] leading-snug text-muted">{c.mechanismLabel}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Status c={c} />
                    {c.lastStatus === "ERROR" && <div className="mt-1 max-w-[180px] text-[11px] text-danger">{c.lastError}</div>}
                    {c.lastCheck?.message && c.lastStatus !== "ERROR" && <div className="mt-1 max-w-[220px] text-[11px] text-muted">{c.lastCheck.message}</div>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex items-center gap-1.5"><span className="text-muted">Current</span><Mono className="text-[11px]">{c.currentVersion ?? "—"}</Mono></div>
                    <div className="mt-0.5 flex items-center gap-1.5"><span className="text-muted">Detected</span><Mono className={versionDiff ? "text-[11px] text-warning" : "text-[11px]"}>{detected ?? "—"}</Mono></div>
                    {c.framework?.versionLabel && <div className="mt-0.5 flex items-center gap-1.5"><span className="text-muted">Workbook</span><Mono className="text-[11px]">{c.framework.versionLabel}</Mono></div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-fg-2"><Tooltip content={formatDateTime(c.lastCheckedAt)}><span>{formatRelative(c.lastCheckedAt)}</span></Tooltip></td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-fg-2"><Tooltip content={formatDateTime(c.lastSuccessAt)}><span>{formatRelative(c.lastSuccessAt)}</span></Tooltip></td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-fg-2">{freq(c.pollingMinutes)}{c.nextCheckAt && <div className="text-[11px] text-subtle">next {formatDateTime(c.nextCheckAt)}</div>}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" disabled={!canWrite || busy} onClick={() => onCheck(c.id)}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check now</Button>
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
        {loading && <TableSkeleton rows={5} cols={6} />}
        {!!error && <ErrorState error={error} />}
      </div>
    </Card>
  );
}
