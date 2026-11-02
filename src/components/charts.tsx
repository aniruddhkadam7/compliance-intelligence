"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

const axisTick = { fill: "var(--muted)", fontSize: 11 };

function ChartTooltip({ active, payload, label, render }: { active?: boolean; payload?: { payload: Record<string, unknown> }[]; label?: string; render: (row: Record<string, unknown>) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-pop">
      <div className="mb-1 font-semibold text-fg">{label}</div>
      {render(payload[0].payload)}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-[2px]" style={{ background: color }} />;
}

/** Single-series horizontal ranking (no legend needed; the card title names the series). */
export function RankedBars({
  data, valueKey, labelKey, height, valueLabel, hrefKey,
}: { data: Record<string, unknown>[]; valueKey: string; labelKey: string; height?: number; valueLabel: string; hrefKey?: string }) {
  const h = height ?? Math.max(160, data.length * 22 + 24);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            type="category" dataKey={labelKey} width={150} tickLine={false} axisLine={false} interval={0}
            tick={({ x, y, payload, index }) => {
              const row = data[index];
              const text = String(payload.value);
              const node = <text x={Number(x) - 6} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--fg-2)">{text.length > 24 ? text.slice(0, 23) + "…" : text}</text>;
              return hrefKey && row ? <Link href={String(row[hrefKey])}>{node}</Link> : node;
            }}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-3)" }}
            content={<ChartTooltip render={(r) => <div className="flex items-center gap-1.5 text-fg-2"><Swatch color="var(--chart-1)" />{valueLabel}: <b className="text-fg tabular">{formatNumber(r[valueKey] as number)}</b></div>} />}
          />
          <Bar
            dataKey={valueKey} fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}
            label={{ position: "right", fill: "var(--muted)", fontSize: 11, formatter: (v: unknown) => formatNumber(Number(v)) }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-part stacked bar: mapped vs not mapped per framework. */
export function CoverageBars({ data }: { data: { short: string; id: string; mapped: number; unmapped: number; total: number }[] }) {
  const h = Math.max(160, data.length * 22 + 24);
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><Swatch color="var(--chart-1)" />Obligations with a mapped CCF control</span>
        <span className="flex items-center gap-1.5"><Swatch color="var(--chart-muted)" />Obligations without a mapped control</span>
      </div>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }} barCategoryGap={4}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="short" width={150} tickLine={false} axisLine={false} interval={0} tick={{ fill: "var(--fg-2)", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "var(--surface-3)" }}
              content={
                <ChartTooltip
                  render={(r) => (
                    <div className="space-y-0.5 text-fg-2">
                      <div className="flex items-center gap-1.5"><Swatch color="var(--chart-1)" />Mapped: <b className="text-fg tabular">{r.mapped as number}</b></div>
                      <div className="flex items-center gap-1.5"><Swatch color="var(--chart-muted)" />Not mapped: <b className="text-fg tabular">{r.unmapped as number}</b></div>
                      <div className="pt-0.5 text-muted">Coverage {formatPercent((r.mapped as number) / Math.max(1, r.total as number))}</div>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="mapped" stackId="a" fill="var(--chart-1)" maxBarSize={14} isAnimationActive={false} stroke="var(--surface)" strokeWidth={1} />
            <Bar
              dataKey="unmapped" stackId="a" fill="var(--chart-muted)" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} stroke="var(--surface)" strokeWidth={1}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** HTML proportion bars for short categorical breakdowns. */
export function BarList({ items, total, className }: { items: { label: string; count: number; href?: string }[]; total?: number; className?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const sum = total ?? items.reduce((n, i) => n + i.count, 0);
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((i) => {
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-fg-2">{i.label}</span>
              <span className="shrink-0 text-muted tabular">{formatNumber(i.count)} <span className="text-subtle">· {formatPercent(i.count / Math.max(1, sum), 0)}</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </>
        );
        return <li key={i.label}>{i.href ? <Link href={i.href} className="block hover:opacity-80">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

/** Single proportion meter with an explicit numerator / denominator. */
export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? value / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[26px] font-semibold tracking-tight tabular">{formatPercent(pct)}</span>
        <span className="text-xs text-muted tabular">{formatNumber(value)} / {formatNumber(total)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={label}>
        <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}
