"use client";
import { useMemo, useState } from "react";
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
  const items = useMemo(() => connectors.data?.items ?? [], [connectors.data]);
  // One entry per framework: a document watch on the same framework (e.g. the CSF PDF) is shown under its main
  // connector, which carries the combined status. Every connector still runs and raises its own updates.
  const { main, also } = useMemo(() => {
    const groups = new Map<string, ConnectorRow[]>();
    for (const c of items) groups.set(c.framework?.id ?? c.id, [...(groups.get(c.framework?.id ?? c.id) ?? []), c]);
    const also: Record<string, ConnectorRow[]> = {};
    const main = [...groups.values()].map((g) => {
      const [first, ...rest] = [...g].sort((a, b) => Number(a.mechanism === "HTTP_FINGERPRINT") - Number(b.mechanism === "HTTP_FINGERPRINT"));
      also[first.id] = rest;
      const failing = g.find((c) => c.lastStatus === "ERROR");
      return { ...first, openUpdates: g.reduce((n, c) => n + c.openUpdates, 0), ...(failing ? { lastStatus: "ERROR", lastError: failing.lastError } : {}) };
    });
    return { main, also };
  }, [items]);

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

  // Download the newest version from the publisher, where it publishes the framework as data, and prepare it as an update.
  async function getNewVersion(id: string) {
    const name = items.find((c) => c.id === id)?.name ?? id;
    setRunning((r) => [...r, id]);
    try {
      const r = await apiSend<{ status: "UP_TO_DATE" | "ALREADY_PREPARED" | "PREPARED"; version: string; sections?: number }>(`/api/connectors/${id}/import`);
      if (r.status === "PREPARED") toast.success(`${name}: version ${r.version} downloaded`, { description: `${r.sections} sections prepared as an update. It now shows as Update available in Sources.` });
      else if (r.status === "ALREADY_PREPARED") toast.info(`${name}: version ${r.version} is already prepared as an update`);
      else toast.success(`${name}: the library already has the newest version (${r.version})`);
      qc.invalidateQueries();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setRunning((r) => r.filter((x) => x !== id));
    }
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

  // "N to review" on a connector: show its open findings in the Update centre below.
  function reviewFindings(id: string) {
    // A grouped entry also carries its document watch's findings; filter to the one connector that has them, or show all.
    const withOpen = [id, ...(also[id] ?? []).map((c) => c.id)].filter((x) => (items.find((c) => c.id === x)?.openUpdates ?? 0) > 0);
    set({ connector: withOpen.length === 1 ? withOpen[0] : "", status: "NEW", update: "" });
    setTimeout(() => document.getElementById("update-centre")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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
          { label: "Connectors", value: main.length, sub: `${main.filter((c) => c.enabled).length} enabled` },
          { label: "Updates to review", value: items.reduce((n, c) => n + c.openUpdates, 0), tone: "warning" },
          { label: "Connector errors", value: errors, tone: errors ? "warning" : "success", sub: errors ? "See status column" : "All healthy" },
          { label: "Last successful sync", value: <span className="text-[15px]">{formatRelative(lastSync)}</span>, sub: "Sources are monitored automatically" },
        ]}
      />
      <ConnectorTable items={main} also={also} loading={connectors.isLoading} error={connectors.error} running={running} canWrite={canWrite} onCheck={(id) => check([id, ...(also[id] ?? []).map((c) => c.id)])} onSync={(id) => Promise.all([id, ...(also[id] ?? []).map((c) => c.id)].map(sync)).then(() => undefined)} onHistory={(id) => set({ history: id })} onReview={reviewFindings} onGetVersion={getNewVersion} />
      <div className="my-3 flex items-start gap-2 text-[11px] text-muted">
        <Info className="mt-px size-3 shrink-0" />
        <span>
          <b className="text-fg-2">Version change</b>: a new version identifier. <b className="text-fg-2">Content change</b>: same version, different content or file.
          <b className="text-fg-2"> New publication</b>: a related document such as an amending act or a successor release. <b className="text-fg-2">New informative reference</b>: a new OLIR/crosswalk publication.
        </span>
      </div>
      <div id="update-centre" className="scroll-mt-4" />
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
