"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { Page, PageHeader, StatStrip } from "@/components/common";
import { Button } from "@/components/ui/button";
import { apiGet, apiSend } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { useMe } from "@/lib/client/use-me";
import { formatRelative } from "@/lib/utils";
import { ConnectorTable, type ConnectorRow } from "./connector-table";
import { UpdatesList } from "./updates-list";
import { ConnectorHistorySheet } from "./connector-history";

export function UpdateCentre() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const canWrite = !!me.data?.canWrite;
  const [s, set] = useUrlState({ update: "", status: "NEW", connector: "", type: "", history: "" });
  const [running, setRunning] = useState<string[]>([]);
  const connectors = useQuery({ queryKey: ["connectors"], queryFn: () => apiGet<{ items: ConnectorRow[] }>("/api/connectors") });
  const items = connectors.data?.items ?? [];

  async function check(ids: string[]) {
    setRunning((r) => [...r, ...ids]);
    // Sequential to stay polite to the official sources.
    for (const id of ids) {
      try {
        const r = await apiSend<{ status: string; message: string; changes: number }>(`/api/connectors/${id}/check`);
        const name = items.find((c) => c.id === id)?.name ?? id;
        if (r.status === "ERROR") toast.error(`${name}: ${r.message}`);
        else if (r.changes) toast.warning(`${name}: ${r.changes} update${r.changes > 1 ? "s" : ""} detected`, { description: r.message });
        else toast.success(`${name}: ${r.message}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Check failed");
      } finally {
        setRunning((r) => r.filter((x) => x !== id));
      }
    }
    qc.invalidateQueries({ queryKey: ["connectors"] });
    qc.invalidateQueries({ queryKey: ["updates"] });
    qc.invalidateQueries({ queryKey: ["connector"] });
    router.refresh();
  }

  async function sync(id: string) {
    try {
      const r = await apiSend<{ previous: string | null; current: string | null }>(`/api/connectors/${id}/sync`);
      toast.success(`Baseline set to ${r.current ?? "latest fingerprint"}`, { description: r.previous && r.previous !== r.current ? `Previously ${r.previous}. CCF mappings were not changed.` : "CCF mappings were not changed." });
      qc.invalidateQueries({ queryKey: ["connectors"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  }

  const lastSync = items.map((c) => c.lastSuccessAt).filter(Boolean).sort().pop();
  const errors = items.filter((c) => c.lastStatus === "ERROR").length;

  return (
    <Page>
      <PageHeader
        title="Updates & Connectors"
        description="Monitors official framework sources for version changes, content changes and new publications. This is separate from the Excel mapping workflow: a detected update is queued for review and never changes approved CCF mappings."
        actions={
          <Button variant="primary" size="sm" disabled={!canWrite || running.length > 0 || !items.length} onClick={() => check(items.filter((c) => c.enabled).map((c) => c.id))}>
            {running.length ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check all now
          </Button>
        }
      />
      {!canWrite && me.data && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
          <ShieldOff className="size-3.5" /> Signed in as {me.data.role}. Checks, synchronisation and review decisions need the analyst or admin role.
        </div>
      )}
      <StatStrip
        className="mb-4 xl:grid-cols-4"
        items={[
          { label: "Connectors", value: items.length, sub: `${items.filter((c) => c.enabled).length} enabled` },
          { label: "Updates to review", value: items.reduce((n, c) => n + c.openUpdates, 0), tone: "warning" },
          { label: "Connector errors", value: errors, tone: errors ? "warning" : "success", sub: errors ? "See status column" : "All healthy" },
          { label: "Last successful sync", value: <span className="text-[15px]">{formatRelative(lastSync)}</span>, sub: "Sources are monitored automatically" },
        ]}
      />
      <ConnectorTable items={items} loading={connectors.isLoading} error={connectors.error} running={running} canWrite={canWrite} onCheck={(id) => check([id])} onSync={sync} onHistory={(id) => set({ history: id })} />
      <div className="my-3 flex items-start gap-2 text-[11px] text-muted">
        <Info className="mt-px size-3 shrink-0" />
        <span>
          <b className="text-fg-2">Version change</b>: a new version identifier. <b className="text-fg-2">Content change</b>: same version, different content or file.
          <b className="text-fg-2"> New publication</b>: a related document such as an amending act or a successor release. <b className="text-fg-2">New informative reference</b>: a new OLIR/crosswalk publication.
        </span>
      </div>
      <UpdatesList
        canWrite={canWrite}
        connectors={items}
        status={s.status}
        connector={s.connector}
        type={s.type}
        selected={s.update}
        set={set}
      />
      <ConnectorHistorySheet id={s.history || null} onClose={() => set({ history: "" })} />
    </Page>
  );
}
