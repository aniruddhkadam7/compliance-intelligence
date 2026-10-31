"use client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/common";
import { DataTable } from "@/components/data-table";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced } from "@/lib/client/hooks";
import { formatNumber } from "@/lib/utils";

interface Row {
  id: string; requirementId: string; name: string | null; riskTopic: string | null; citations: number;
  secondaryControls: string[]; reviewSheets: string[]; latestSheet: string | null;
  result: string | null; resultPtf: string | null; resultNptf: string | null;
}

const tone = (v: string | null) => (!v ? "outline" : /no match/i.test(v) ? "warning" : /match found/i.test(v) ? "info" : "neutral");

export function UnmappedView() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [dq]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["unmapped", dq, page],
    queryFn: () => apiGet<{ items: Row[]; total: number }>(`/api/mappings${qs({ view: "unmapped", q: dq, page })}`),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: "id", header: "IR", size: 70, enableSorting: false, cell: ({ row }) => <Mono className="font-medium text-fg">{row.original.requirementId}</Mono> },
    {
      id: "name", header: "Requirement", enableSorting: false,
      cell: ({ row }) => <div className="min-w-[260px]"><div className="text-fg">{row.original.name}</div><div className="text-[11px] text-muted">{row.original.riskTopic}</div></div>,
    },
    { id: "cit", header: "Citations", size: 80, enableSorting: false, cell: ({ row }) => <span className="tabular">{row.original.citations}</span> },
    {
      id: "sec", header: "Secondary mapping", enableSorting: false,
      cell: ({ row }) => row.original.secondaryControls.length ? <div className="flex flex-wrap gap-1">{row.original.secondaryControls.map((c) => <Badge key={c} tone="outline" className="font-mono">{c}</Badge>)}</div> : <span className="text-subtle">—</span>,
    },
    {
      id: "review", header: "Review analysis (candidate only)", enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <div className="flex flex-wrap items-center gap-1">
          {r.result && <Badge tone={tone(r.result)}>Overall: {r.result}</Badge>}
          {r.resultPtf && <Badge tone={tone(r.resultPtf)}>PTF: {r.resultPtf}</Badge>}
          {r.resultNptf && <Badge tone={tone(r.resultNptf)}>NPTF: {r.resultNptf}</Badge>}
          {!r.latestSheet && <span className="text-subtle">Not reviewed</span>}
        </div>
      ),
    },
    { id: "sheets", header: "Sheets", size: 70, enableSorting: false, cell: ({ row }) => <span className="text-xs text-muted tabular">{row.original.reviewSheets.length}</span> },
  ], []);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] text-fg-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Prioritised integrated requirements with no primary CCF mapping on the authoritative sheet. The workbook&apos;s “Unmapped IRs” sheets record review analyses (PTF = product-team-facing, NPTF = non-product-team-facing).
          A “Match Found” result is a <b>candidate</b> and has not been approved. Candidates are never turned into mappings here.
        </span>
      </div>
      <Card>
        <div className="border-b border-border p-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search IR ID, name or risk topic…" className="pl-8" aria-label="Search unmapped requirements" />
          </div>
        </div>
        <div className="px-4 py-2 text-xs text-muted tabular">{data ? `${formatNumber(data.total)} unmapped prioritised requirements` : "…"} · latest analysis from “Unmapped IRs (3)”</div>
        <DataTable
          columns={columns} data={data?.items} total={data?.total} page={page} onPageChange={setPage}
          loading={isLoading} error={error} onRetry={refetch} rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/requirements/${r.requirementId}`)}
        />
      </Card>
    </div>
  );
}
