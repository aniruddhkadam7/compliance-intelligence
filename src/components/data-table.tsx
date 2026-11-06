"use client";
import * as React from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common";

export type SortState = { id: string; desc: boolean } | null;

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  empty?: React.ReactNode;
  dense?: boolean;
}

/** Server-driven table: sorting and pagination are delegated to the caller (API). */
export function DataTable<T>({
  columns, data, total = 0, page = 1, pageSize = 25, onPageChange, sort, onSortChange, loading, error, onRetry,
  onRowClick, rowKey, selectedKey, empty, dense,
}: DataTableProps<T>) {
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (r) => rowKey(r),
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-surface-2">
                {hg.headers.map((h) => {
                  const sortable = h.column.columnDef.enableSorting !== false && !!onSortChange;
                  const active = sort?.id === h.column.id;
                  const size = h.column.columnDef.size;
                  return (
                    <th
                      key={h.id}
                      style={size && size !== 150 ? { width: size } : undefined}
                      className="h-8 whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-wide text-muted first:pl-4 last:pr-4"
                    >
                      {sortable ? (
                        <button
                          className={cn("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")}
                          onClick={() => onSortChange!(active ? (sort!.desc ? null : { id: h.column.id, desc: true }) : { id: h.column.id, desc: false })}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {active ? sort!.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {!loading && !error && (
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "group border-b border-border last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-surface-2",
                    selectedKey === row.id && "bg-accent-soft/60 hover:bg-accent-soft/60",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-3 align-top text-[13px] first:pl-4 last:pr-4", dense ? "py-1.5" : "py-2.5",
                      // A clickable row underlines its first cell (the name or ID) on hover, as links do.
                      onRowClick && "first:group-hover:underline first:group-hover:underline-offset-2")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
        {loading && <TableSkeleton cols={Math.min(columns.length, 6)} />}
        {!!error && !loading && <ErrorState error={error} onRetry={onRetry} />}
        {!loading && !error && data && data.length === 0 && (empty ?? <EmptyState title="No records match" description="Adjust the search or filters." />)}
      </div>
      {onPageChange && total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted">
          <span className="tabular">
            {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
          </span>
          <div className="flex items-center gap-1">
            <span className="mr-2 tabular">Page {page} of {formatNumber(pages)}</span>
            <Button size="icon-sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
            <Button size="icon-sm" variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
