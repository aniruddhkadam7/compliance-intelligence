"use client";
import { useMemo, useState } from "react";

export interface DiagramNode { label: string; count: number }
export interface DiagramEdge { from: string; to: string; count: number }
export interface DiagramColumn { title: string; color: string; nodes: DiagramNode[] }

const ROW = 26;
const TOP = 36;
const W = 1000;
const BAR = 10;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * Column-to-column connection diagram (two or three columns). Node bar height reflects how many linked
 * sections it holds; link width reflects how many section pairs connect the two nodes.
 */
export function ConnectionDiagram({ columns, edgeSets, unit }: { columns: DiagramColumn[]; edgeSets: DiagramEdge[][]; unit: string }) {
  const [hover, setHover] = useState<{ col: number; label: string } | null>(null);
  const three = columns.length === 3;
  const xs = three ? [250, 495, 740] : [300, 690];

  const layout = useMemo(() => {
    const height = Math.max(...columns.map((c) => c.nodes.length)) * ROW;
    const maxNode = Math.max(1, ...columns.flatMap((c) => c.nodes.map((n) => n.count)));
    const pos = columns.map((c) => {
      const offset = TOP + (height - c.nodes.length * ROW) / 2;
      return new Map(c.nodes.map((n, i) => [n.label, { y: offset + i * ROW + ROW / 2, h: 6 + (n.count / maxNode) * 14 }]));
    });
    const maxEdge = Math.max(1, ...edgeSets.flat().map((e) => e.count));
    return { height: height + TOP + 8, pos, maxEdge };
  }, [columns, edgeSets]);

  // Nodes connected to the hovered node (across all columns) stay highlighted.
  const lit = useMemo(() => {
    if (!hover) return null;
    const on = new Set([`${hover.col}:${hover.label}`]);
    for (let i = hover.col; i < edgeSets.length; i++)
      for (const e of edgeSets[i]) if (on.has(`${i}:${e.from}`)) on.add(`${i + 1}:${e.to}`);
    for (let i = hover.col - 1; i >= 0; i--)
      for (const e of edgeSets[i]) if (on.has(`${i + 1}:${e.to}`)) on.add(`${i}:${e.from}`);
    return on;
  }, [hover, edgeSets]);

  return (
    <svg viewBox={`0 0 ${W} ${layout.height}`} className="w-full" role="img" aria-label="Connection diagram">
      {columns.map((c, i) => (
        <text key={c.title} x={xs[i] + (i === 0 ? BAR : three && i === 1 ? BAR / 2 : 0)} y={16} textAnchor={i === 0 ? "end" : three && i === 1 ? "middle" : "start"} className="fill-[var(--fg)] text-[13px] font-semibold">
          <tspan fill={c.color}>■ </tspan>{clip(c.title, 40)}
        </text>
      ))}

      {edgeSets.map((set, i) =>
        set.map((e) => {
          const s = layout.pos[i].get(e.from), t = layout.pos[i + 1].get(e.to);
          if (!s || !t) return null;
          const x1 = xs[i] + BAR, x2 = xs[i + 1], mx = (x1 + x2) / 2;
          const on = !lit || (lit.has(`${i}:${e.from}`) && lit.has(`${i + 1}:${e.to}`));
          return (
            <path
              key={`${i}-${e.from}-${e.to}`}
              d={`M${x1},${s.y} C${mx},${s.y} ${mx},${t.y} ${x2},${t.y}`}
              fill="none"
              stroke={columns[i].color}
              strokeWidth={1.5 + (e.count / layout.maxEdge) * 9}
              strokeOpacity={on ? (lit ? 0.75 : 0.35) : 0.06}
              className="transition-[stroke-opacity]"
            >
              <title>{`${e.from} → ${e.to}: ${e.count} ${unit}`}</title>
            </path>
          );
        }),
      )}

      {columns.map((c, i) =>
        c.nodes.map((n) => {
          const p = layout.pos[i].get(n.label)!;
          const on = !lit || lit.has(`${i}:${n.label}`);
          const anchor = i === 0 ? "end" : "start";
          const tx = i === 0 ? xs[i] - 8 : xs[i] + BAR + 8;
          return (
            <g key={`${i}-${n.label}`} onMouseEnter={() => setHover({ col: i, label: n.label })} onMouseLeave={() => setHover(null)} className="cursor-default" opacity={on ? 1 : 0.3}>
              <rect x={xs[i]} y={p.y - p.h / 2} width={BAR} height={p.h} rx={2} fill={c.color} />
              <text x={tx} y={p.y} dominantBaseline="middle" textAnchor={anchor} className="fill-[var(--fg-2)] text-[12px]">
                {clip(n.label, three && i === 1 ? 22 : three ? 34 : 42)}
                <tspan className="fill-[var(--subtle)]"> {n.count}</tspan>
                <title>{`${n.label}: ${n.count}`}</title>
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
