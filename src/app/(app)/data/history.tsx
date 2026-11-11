"use client";
import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/common";
import { DataTable } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { formatDateTime, formatNumber } from "@/lib/utils";

interface Job {
  id: string; kind: string; fileName: string; fileSize: number; fileHash: string; status: string; counts: Record<string, number> | null;
  actor: string; createdAt: string; completedAt: string | null; _count: { issues: number };
}
interface Audit { id: string; actor: string; role: string | null; action: string; entity: string; entityId: string | null; details: unknown; createdAt: string }

const KIND_LABEL: Record<string, string> = {
  LIBRARY: "Document library", CLIENT_CONTROLS: "Client controls", RELATIONSHIPS: "Source relationships",
  CCF_WORKBOOK: "Workbook (legacy)", TRANSITION_WORKBOOK: "Transition (legacy)",
};

const statusTone = (s: string) => (s === "COMPLETED" ? "success" : s === "FAILED" ? "danger" : "neutral");
/** A validated file that was never confirmed changed nothing; say so instead of the internal "previewed". */
const STATUS_LABEL: Record<string, string> = { COMPLETED: "Imported", FAILED: "Rejected", PREVIEWED: "Validated only", RUNNING: "Importing" };

export function ImportHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["imports", page],
    queryFn: () => apiGet<{ items: Job[]; total: number }>(`/api/import${qs({ view: "jobs", page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<Job, unknown>[]>(() => [
    { id: "createdAt", header: "Started", size: 150, enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-fg-2">{formatDateTime(row.original.createdAt)}</span> },
    { id: "kind", header: "Type", size: 120, enableSorting: false, cell: ({ row }) => <Badge tone="outline">{KIND_LABEL[row.original.kind] ?? row.original.kind}</Badge> },
    { id: "file", header: "File", enableSorting: false, cell: ({ row }) => <div><div className="text-fg">{row.original.fileName}</div><Mono className="text-[10.5px] text-subtle">sha256 {row.original.fileHash.slice(0, 16)}… · {(row.original.fileSize / 1024 / 1024).toFixed(2)} MB</Mono></div> },
    { id: "status", header: "Status", size: 110, enableSorting: false, cell: ({ row }) => <Badge tone={statusTone(row.original.status)}>{STATUS_LABEL[row.original.status] ?? row.original.status.toLowerCase()}</Badge> },
    {
      id: "counts", header: "Records", enableSorting: false,
      cell: ({ row }) => {
        const c = row.original.counts;
        if (!c) return <span className="text-subtle">—</span>;
        // Imported: records written (counted from the database). Otherwise: what the file holds; nothing was written.
        const parts = ([["controls", "controls"], ["testProcedures", "test procedures"], ["crossFramework", "relationships"], ["librarySections", "library sections"], ["sectionsWritten", "library sections"], ["citations", "obligations"], ["rows", "rows"]] as const)
          .filter(([k]) => c[k] != null).map(([k, l]) => `${formatNumber(c[k])} ${l}`);
        return <span className="text-xs text-fg-2 tabular">{row.original.status === "COMPLETED" ? "Written: " : "In file: "}{parts.join(" · ") || "—"}</span>;
      },
    },
    { id: "issues", header: "Issues", size: 70, enableSorting: false, cell: ({ row }) => <span className="tabular">{row.original._count.issues}</span> },
    { id: "actor", header: "By", size: 80, enableSorting: false, cell: ({ row }) => <span className="text-fg-2">{row.original.actor}</span> },
  ], []);
  return (
    <Card>
      <DataTable columns={columns} data={data?.items} total={data?.total} page={page} onPageChange={setPage} loading={isLoading} error={error} onRetry={refetch} rowKey={(r) => r.id} />
    </Card>
  );
}

export function AuditLogView() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["audit", page],
    queryFn: () => apiGet<{ items: Audit[]; total: number }>(`/api/import${qs({ view: "audit", page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<Audit, unknown>[]>(() => [
    { id: "t", header: "Time", size: 150, enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-fg-2">{formatDateTime(row.original.createdAt)}</span> },
    { id: "actor", header: "Actor", size: 120, enableSorting: false, cell: ({ row }) => <span className="text-fg">{row.original.actor}{row.original.role && <span className="ml-1 text-[11px] text-muted">({row.original.role})</span>}</span> },
    { id: "action", header: "Action", size: 180, enableSorting: false, cell: ({ row }) => <Mono className="text-[11px]">{row.original.action}</Mono> },
    { id: "entity", header: "Entity", size: 160, enableSorting: false, cell: ({ row }) => <span className="text-xs text-fg-2">{row.original.entity}{row.original.entityId && <Mono className="ml-1 text-[10.5px] text-subtle">{row.original.entityId.slice(0, 10)}</Mono>}</span> },
    { id: "details", header: "Details", enableSorting: false, cell: ({ row }) => <code className="line-clamp-2 break-all text-[11px] text-muted">{row.original.details ? JSON.stringify(row.original.details) : ""}</code> },
  ], []);
  return (
    <Card>
      <DataTable columns={columns} data={data?.items} total={data?.total} page={page} pageSize={50} onPageChange={setPage} loading={isLoading} error={error} onRetry={refetch} rowKey={(r) => r.id} dense />
    </Card>
  );
}
