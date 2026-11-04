"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FrameworkConnection } from "@/lib/queries/framework-matrix";

type Pair = FrameworkConnection["sections"][number];
type Sec = Pair["a"];

const ROW = 22;
const GROUP = 26;
const TOP = 40;
const W = 1000;
const XA = 330;
const XB = 670;
const TYPE_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)", "var(--chart-2)", "var(--chart-4)"];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const byId = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
const titleOf = (s: Sec) => s.title;

/**
 * Framework relationship graph: the requirements of one domain of framework A (left) and the requirements of
 * framework B they are related to (right, grouped by B's domains). Each line is one stated relationship from
 * the supplied relationship files, coloured by its relationship type.
 */
export function RelationshipGraph({ data, colors }: { data: FrameworkConnection; colors: { a: string; b: string } }) {
  const domains = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.sections) m.set(p.a.domain, (m.get(p.a.domain) ?? 0) + 1);
    return [...m].map(([label, count]) => ({ label, count })).sort((x, y) => byId(x.label, y.label));
  }, [data.sections]);
  const [domain, setDomain] = useState<string | null>(null);
  const focus = domain && domains.some((d) => d.label === domain) ? domain : domains.reduce<{ label: string; count: number } | null>((best, d) => (!best || d.count > best.count ? d : best), null)?.label ?? null;
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const types = useMemo(() => [...new Set(data.sections.flatMap((p) => p.types))].sort(), [data.sections]);
  const typeColor = (t: string | undefined) => TYPE_COLORS[Math.max(0, types.indexOf(t ?? "")) % TYPE_COLORS.length];

  const g = useMemo(() => {
    const pairs = data.sections.filter((p) => p.a.domain === focus);
    const left = [...new Map(pairs.map((p) => [p.a.id, p.a])).values()].sort((x, y) => byId(x.identifier, y.identifier));
    const right = [...new Map(pairs.map((p) => [p.b.id, p.b])).values()];
    const groups = [...new Set(right.map((s) => s.domain))].sort(byId).map((d) => ({ domain: d, items: right.filter((s) => s.domain === d).sort((x, y) => byId(x.identifier, y.identifier)) }));
    const pos = new Map<string, number>();
    let y = TOP;
    const heads: { label: string; y: number }[] = [];
    for (const grp of groups) {
      heads.push({ label: grp.domain, y: y + GROUP / 2 + 4 });
      y += GROUP;
      for (const s of grp.items) { pos.set(`b:${s.id}`, y + ROW / 2); y += ROW; }
    }
    const rightH = y - TOP;
    const offset = TOP + Math.max(0, (rightH - left.length * ROW) / 2);
    left.forEach((s, i) => pos.set(`a:${s.id}`, offset + i * ROW + ROW / 2));
    return { pairs, left, groups, heads, pos, height: Math.max(rightH, left.length * ROW) + TOP + 12 };
  }, [data.sections, focus]);

  const active = pinned ?? hover;
  const lit = useMemo(() => {
    if (!active) return null;
    const on = new Set([active]);
    for (const p of g.pairs) if (`a:${p.a.id}` === active || `b:${p.b.id}` === active) { on.add(`a:${p.a.id}`); on.add(`b:${p.b.id}`); }
    return on;
  }, [active, g.pairs]);

  const selected = pinned
    ? (() => {
        const [side, id] = pinned.split(":") as ["a" | "b", string];
        const links = g.pairs.filter((p) => p[side].id === id);
        return links.length ? { side, node: links[0][side], links } : null;
      })()
    : null;

  if (!focus) return null;
  const node = (side: "a" | "b", s: Sec) => {
    const key = `${side}:${s.id}`, y = g.pos.get(key)!, on = !lit || lit.has(key);
    const x = side === "a" ? XA : XB, anchor = side === "a" ? "end" : "start", tx = side === "a" ? XA - 10 : XB + 10;
    const title = titleOf(s);
    return (
      <g key={key} opacity={on ? 1 : 0.25} className="cursor-pointer" onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)} onClick={() => setPinned(pinned === key ? null : key)}>
        <circle cx={x} cy={y} r={pinned === key ? 6 : 4.5} fill={side === "a" ? colors.a : colors.b} stroke="var(--surface)" strokeWidth={1.5} />
        <text x={tx} y={y} dominantBaseline="middle" textAnchor={anchor} className="text-[12px]">
          {side === "b" && <tspan className="fill-[var(--fg)] font-mono font-medium">{clip(s.identifier, 20)}</tspan>}
          {title && <tspan className="fill-[var(--muted)]">{side === "b" ? "  " : ""}{clip(title, 26)}{side === "a" ? "  " : ""}</tspan>}
          {side === "a" && <tspan className="fill-[var(--fg)] font-mono font-medium">{clip(s.identifier, 20)}</tspan>}
          <title>{`${s.identifier}${title ? ` ${title}` : ""}`}</title>
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted">{data.a?.short} domain:</span>
        {domains.map((d) => (
          <button key={d.label} onClick={() => { setDomain(d.label); setPinned(null); }} className={cn("rounded-full border px-2.5 py-0.5 text-xs", d.label === focus ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-fg-2 hover:border-accent")}>
            {d.label} <span className="tabular text-subtle">{d.count}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${g.height}`} className="w-full min-w-[760px]" role="img" aria-label={`Relationship graph: ${focus} of ${data.a?.short} and related requirements of ${data.b?.short}`}>
          <text x={XA} y={16} textAnchor="end" className="fill-[var(--fg)] text-[13px] font-semibold"><tspan fill={colors.a}>● </tspan>{data.a?.short} · {clip(focus, 34)}</text>
          <text x={XB} y={16} className="fill-[var(--fg)] text-[13px] font-semibold"><tspan fill={colors.b}>● </tspan>{data.b?.short}</text>
          {g.heads.map((h) => <text key={h.label} x={XB - 4} y={h.y} className="fill-[var(--subtle)] text-[11px] font-semibold uppercase tracking-wide">{clip(h.label, 48)}</text>)}
          {g.pairs.map((p) => {
            const ya = g.pos.get(`a:${p.a.id}`)!, yb = g.pos.get(`b:${p.b.id}`)!, mx = (XA + XB) / 2;
            const on = !lit || (lit.has(`a:${p.a.id}`) && lit.has(`b:${p.b.id}`) && (active === `a:${p.a.id}` || active === `b:${p.b.id}`));
            return (
              <path key={`${p.a.id}|${p.b.id}`} d={`M${XA},${ya} C${mx},${ya} ${mx},${yb} ${XB},${yb}`} fill="none" stroke={typeColor(p.types[0])} strokeWidth={on && lit ? 2 : 1.25} strokeOpacity={on ? (lit ? 0.9 : 0.4) : 0.05} className="transition-[stroke-opacity]">
                <title>{`${p.a.identifier} ↔ ${p.b.identifier}${p.types.length ? `: ${p.types.join(", ")}` : ""}`}</title>
              </path>
            );
          })}
          {g.left.map((s) => node("a", s))}
          {g.groups.flatMap((grp) => grp.items.map((s) => node("b", s)))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        {types.map((t) => <span key={t} className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: typeColor(t) }} />{t}</span>)}
        <span>{g.pairs.length} relationship(s) in this domain · hover a requirement to trace it, click to pin it</span>
      </div>

      {selected && (
        <div className="rounded-md border border-border bg-surface-2 p-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="font-mono font-semibold text-fg">{selected.node.identifier}</span>
              <span className="ml-2 text-muted">{selected.side === "a" ? data.a?.short : data.b?.short} · {selected.node.domain}</span>
              {titleOf(selected.node) && <div className="text-fg-2">{titleOf(selected.node)}</div>}
            </div>
            <button onClick={() => setPinned(null)} className="text-muted hover:text-fg">Close</button>
          </div>
          {selected.node.description && <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-muted">{selected.node.description}</p>}
          <div className="mt-2 font-semibold text-fg-2">Related in {selected.side === "a" ? data.b?.short : data.a?.short} ({selected.links.length})</div>
          <ul className="mt-1 space-y-1.5">
            {selected.links.map((p) => {
              const o = selected.side === "a" ? p.b : p.a;
              return (
                <li key={o.id} className="flex gap-2">
                  <span className="mt-1 h-0.5 w-3 shrink-0 rounded" style={{ background: typeColor(p.types[0]) }} />
                  <div className="min-w-0">
                    <span className="font-mono font-medium text-fg">{o.identifier}</span>
                    {titleOf(o) && <span className="text-fg-2"> {titleOf(o)}</span>}
                    {p.types.length > 0 && <span className="text-subtle"> · {p.types.join(", ")}</span>}
                    {o.description && <div className="line-clamp-2 text-muted">{o.description}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
