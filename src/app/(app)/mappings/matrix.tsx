"use client";
import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatPercent } from "@/lib/utils";

export interface Matrix {
  frameworks: { id: string; name: string; short: string }[];
  cells: { a: string; b: string; shared: number }[];
}

// Sequential blue ramp (validated reference palette, steps 100→700).
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export function MatrixView({ matrix, loading, onSelect }: { matrix?: Matrix; loading: boolean; onSelect: (a: string, b: string) => void }) {
  const [hover, setHover] = useState<{ a: string; b: string } | null>(null);
  const { order, lookup, max, self } = useMemo(() => {
    const lookup = new Map<string, number>();
    const self = new Map<string, number>();
    let max = 1;
    for (const c of matrix?.cells ?? []) {
      lookup.set(`${c.a}|${c.b}`, c.shared);
      if (c.a === c.b) self.set(c.a, c.shared);
      else max = Math.max(max, c.shared);
    }
    const order = [...(matrix?.frameworks ?? [])].sort((x, y) => (self.get(y.id) ?? 0) - (self.get(x.id) ?? 0));
    return { order, lookup, max, self };
  }, [matrix]);

  if (loading || !matrix) return <Card className="p-4"><Skeleton className="h-[520px]" /></Card>;

  const h = hover ? { a: order.find((f) => f.id === hover.a)!, b: order.find((f) => f.id === hover.b)!, n: lookup.get(`${hover.a}|${hover.b}`) ?? 0 } : null;

  return (
    <Card>
      <CardHeader
        title="Shared integrated requirements"
        description="Each cell is the number of ArC integrated requirements cited by both sources. The diagonal shows each source's total. Select a cell to open the pair."
        actions={
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>0</span>
            <div className="flex">{RAMP.map((c) => <span key={c} className="h-2.5 w-5" style={{ background: c }} />)}</div>
            <span>{max}</span>
          </div>
        }
      />
      <div className="flex min-h-6 items-center px-4 py-2 text-xs text-muted">
        {h ? (
          <span>
            <b className="text-fg">{h.a.short}</b> × <b className="text-fg">{h.b.short}</b>: <b className="tabular text-fg">{h.n}</b> shared IRs
            {h.a.id !== h.b.id && ` (${formatPercent(h.n / Math.max(1, self.get(h.a.id) ?? 1), 0)} of ${h.a.short}'s requirements)`}
          </span>
        ) : "Hover a cell for details."}
      </div>
      <div className="scrollbar-thin overflow-auto px-4 pb-4">
        <table className="border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th />
              {order.map((f) => (
                <th key={f.id} className="h-[132px] w-[22px] align-bottom">
                  <div className={cn("w-[22px] origin-bottom-left translate-x-[14px] -rotate-60 whitespace-nowrap text-left text-[10.5px] font-normal", hover?.b === f.id ? "text-fg" : "text-muted")}>
                    {f.short}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((row) => (
              <tr key={row.id}>
                <th className={cn("whitespace-nowrap pr-2 text-right text-[11px] font-normal", hover?.a === row.id ? "text-fg" : "text-muted")}>{row.short}</th>
                {order.map((col) => {
                  const n = lookup.get(`${row.id}|${col.id}`) ?? 0;
                  const diag = row.id === col.id;
                  const bg = diag ? "var(--surface-3)" : n === 0 ? "var(--surface-2)" : RAMP[Math.min(RAMP.length - 1, Math.floor((n / max) * RAMP.length))];
                  return (
                    <td key={col.id} className="p-0">
                      <button
                        onMouseEnter={() => setHover({ a: row.id, b: col.id })}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover({ a: row.id, b: col.id })}
                        onClick={() => !diag && n > 0 && onSelect(row.id, col.id)}
                        aria-label={`${row.short} and ${col.short}: ${n} shared requirements`}
                        className={cn("grid size-[22px] place-items-center rounded-[3px] text-[9px] tabular", diag ? "cursor-default font-semibold text-fg-2" : n > 0 ? "cursor-pointer hover:ring-2 hover:ring-fg" : "cursor-default")}
                        style={{ background: bg, color: !diag && n / max > 0.45 ? "#fff" : undefined }}
                      >
                        {diag ? n : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
