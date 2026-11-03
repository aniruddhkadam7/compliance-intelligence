"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, formatPercent } from "@/lib/utils";

export interface Slice { label: string; value: number; color: string }

/** Part-to-whole for a few categories: a small donut with the headline in the middle. Labels sit beside it (see caller). */
export function Donut({ data, center, sub, size = 128 }: { data: Slice[]; center: string; sub: string; size?: number }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={shown} dataKey="value" nameKey="label" innerRadius={size * 0.36} outerRadius={size * 0.5} startAngle={90} endAngle={-270} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
            {shown.map((d) => <Cell key={d.label} fill={d.color} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const s = payload[0].payload as Slice;
              return (
                <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-pop">
                  <span className="mr-1.5 inline-block size-2 rounded-[2px]" style={{ background: s.color }} />
                  <span className="text-fg-2">{s.label}: </span><b className="tabular text-fg">{formatNumber(s.value)}</b>
                  <span className="text-subtle"> · {formatPercent(s.value / Math.max(1, total), 0)}</span>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div><div className="text-xl font-semibold leading-none tabular text-fg">{center}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{sub}</div></div>
      </div>
    </div>
  );
}
