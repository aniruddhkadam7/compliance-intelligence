"use client";
import { useQuery } from "@tanstack/react-query";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Mono } from "@/components/common";
import { apiGet } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

interface Detail {
  id: string; name: string;
  checks: { id: string; trigger: string; status: string; httpStatus: number | null; durationMs: number | null; contentHash: string | null; detectedVersion: string | null; message: string | null; actor: string | null; checkedAt: string }[];
}

const TONE = { OK: "success", BASELINE: "info", CHANGED: "warning", ERROR: "danger" } as const;

export function ConnectorHistorySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["connector", id], queryFn: () => apiGet<Detail>(`/api/connectors/${id}`), enabled: !!id });
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={data?.name ?? "Connector"} description="Check history (latest 30)">
      {isLoading && <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
      {!!error && <ErrorState error={error} />}
      {data && !data.checks.length && <EmptyState title="Not checked yet" />}
      <ul className="divide-y divide-border">
        {data?.checks.map((c) => (
          <li key={c.id} className="space-y-1 px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Badge tone={TONE[c.status as keyof typeof TONE] ?? "neutral"}>{c.status.toLowerCase()}</Badge>
                <span className="text-xs text-fg-2">{formatDateTime(c.checkedAt)}</span>
              </span>
              <span className="text-[11px] text-muted">{c.trigger.toLowerCase()}{c.actor ? ` · ${c.actor}` : ""}</span>
            </div>
            <p className="text-xs text-fg-2">{c.message}</p>
            <div className="flex flex-wrap gap-x-4 text-[11px] text-subtle">
              {c.httpStatus != null && <span>HTTP {c.httpStatus}</span>}
              {c.durationMs != null && <span>{(c.durationMs / 1000).toFixed(1)} s</span>}
              {c.detectedVersion && <span>version <Mono className="text-[11px]">{c.detectedVersion}</Mono></span>}
              {c.contentHash && <span>hash <Mono className="text-[11px]">{c.contentHash.slice(0, 12)}</Mono></span>}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
