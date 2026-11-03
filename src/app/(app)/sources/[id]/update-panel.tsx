"use client";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckDetails, UpdateAction, useCheckForUpdates, type Role } from "../sources-catalog";
import { UPDATE_CHECK } from "@/lib/updates/labels";
import type { SourceDetail } from "@/lib/queries/sources";
import { formatDateTime } from "@/lib/utils";

/** Latest verified version at the publisher, with its evidence and the check history. */
export function UpdatePanel({ d, role }: { d: SourceDetail; role: Role }) {
  const { run, running } = useCheckForUpdates();
  const canWrite = role === "admin" || role === "analyst";
  return (
    <Card id="updates">
      <CardHeader
        title="Version updates"
        description="Latest version verified at the publisher's official source"
        icon={<RefreshCw />}
        actions={canWrite ? (
          <span className="flex gap-2">
            <Button size="sm" disabled={!!running} onClick={() => run([{ id: d.id, short: d.short }])}>{running ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check for Updates</Button>
          </span>
        ) : null}
      />
      <CardBody className="space-y-4">
        <UpdateAction d={d} role={role} />
        <CheckDetails d={d} />
        {d.checkHistory.length > 1 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted">Check history ({d.checkHistory.length})</summary>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {d.checkHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <span className="text-muted">{formatDateTime(h.checkedAt)}</span>
                  <Badge tone={UPDATE_CHECK[h.status]?.tone ?? "neutral"}>{UPDATE_CHECK[h.status]?.label ?? h.status}</Badge>
                  <span className="text-fg-2">{h.latestVersion ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{h.message}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
