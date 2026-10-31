"use client";
import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import { DataTable } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { ISSUE_LABELS } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

interface Issue { id: string; severity: string; code: string; sheet: string | null; row: number | null; column: string | null; message: string }
interface Resp { items: Issue[]; total: number; job: { fileName: string; completedAt: string } | null; summary: { severity: string; code: string; count: number }[] }

const SEV_ORDER = ["ERROR", "WARNING", "INFO"];

export function DataQuality({ code, severity, onFilter }: { code: string; severity: string; onFilter: (p: { code?: string; severity?: string }) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["issues", code, severity, page],
    queryFn: () => apiGet<Resp>(`/api/import${qs({ view: "issues", code, severity, page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });
  const summary = [...(data?.summary ?? [])].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.count - a.count);

  const columns = useMemo<ColumnDef<Issue, unknown>[]>(() => [
    {
      id: "sev", header: "Severity", size: 90, enableSorting: false,
      cell: ({ row }) => <Badge tone={row.original.severity === "ERROR" ? "danger" : row.original.severity === "WARNING" ? "warning" : "neutral"}>{row.original.severity.toLowerCase()}</Badge>,
    },
    { id: "code", header: "Finding", size: 220, enableSorting: false, cell: ({ row }) => <span className="text-fg">{ISSUE_LABELS[row.original.code] ?? row.original.code}</span> },
    { id: "msg", header: "Detail", enableSorting: false, cell: ({ row }) => <span className="text-fg-2">{row.original.message}</span> },
    {
      id: "loc", header: "Location", size: 220, enableSorting: false,
      cell: ({ row: { original: i } }) => <span className="text-xs text-muted">{i.sheet}{i.row ? ` · row ${i.row}` : ""}{i.column ? ` · “${i.column.replace(/\n/g, " ").slice(0, 40)}”` : ""}</span>,
    },
  ], []);

  if (!isLoading && !data?.job) return <Card><EmptyState title="No completed import" description="Import a CCF workbook to see data quality findings." /></Card>;

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <Card className="h-fit">
        <CardHeader title="Findings" description={data?.job ? `${data.job.fileName} · ${formatDateTime(data.job.completedAt)}` : undefined} />
        <ul className="p-1">
          <li>
            <button onClick={() => { setPage(1); onFilter({ code: "", severity: "" }); }} className={cn("flex w-full items-center justify-between rounded-[4px] px-3 py-1.5 text-[13px]", !code && !severity ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2")}>
              All findings <span className="text-xs text-muted tabular">{summary.reduce((n, s) => n + s.count, 0)}</span>
            </button>
          </li>
          {summary.map((s) => {
            const Icon = s.severity === "ERROR" ? XCircle : s.severity === "WARNING" ? AlertTriangle : Info;
            return (
              <li key={s.severity + s.code}>
                <button onClick={() => { setPage(1); onFilter({ code: s.code, severity: s.severity }); }} className={cn("flex w-full items-center gap-2 rounded-[4px] px-3 py-1.5 text-left text-[13px]", code === s.code ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2")}>
                  <Icon className={cn("size-3.5 shrink-0", s.severity === "ERROR" ? "text-danger" : s.severity === "WARNING" ? "text-warning" : "text-muted")} />
                  <span className="flex-1 truncate">{ISSUE_LABELS[s.code] ?? s.code}</span>
                  <span className="text-xs text-muted tabular">{s.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="xl:col-span-3">
        <DataTable columns={columns} data={data?.items} total={data?.total} page={page} pageSize={50} onPageChange={setPage} loading={isLoading} error={error} onRetry={refetch} rowKey={(r) => r.id} dense />
      </Card>
    </div>
  );
}
