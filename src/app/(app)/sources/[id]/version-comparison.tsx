"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { Mono } from "@/components/common";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HeadingRow, HeadingStatus, SectionChange, VersionComparison as Comparison } from "@/lib/sources/headings";
import { cn, formatNumber } from "@/lib/utils";

const STATUS: Record<HeadingStatus, { label: string; tone: Tone }> = {
  BOTH: { label: "In both", tone: "neutral" },
  ONLY_CURRENT: { label: "New", tone: "success" },
  ONLY_PREVIOUS: { label: "No longer present", tone: "danger" },
};

type Tab = "domains" | "segments" | "changed" | "added" | "removed";

export function VersionComparison({ c, previous, current }: { c: Comparison; previous: { id: string; short: string }; current: string }) {
  const tabs: { id: Tab; label: string; n: number; show: boolean }[] = [
    { id: "domains", label: "Domains", n: c.domains.length, show: c.domains.length > 0 },
    { id: "segments", label: "Segments", n: c.segments.length, show: c.segments.length > 0 },
    { id: "added", label: "New sections", n: c.identifiers.added.length, show: c.identifiers.comparable },
    { id: "removed", label: "No longer present", n: c.identifiers.removed.length, show: c.identifiers.comparable },
    { id: "changed", label: "Reworded", n: c.identifiers.changed.length, show: c.identifiers.comparable },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(visible[0]?.id ?? "domains");

  return (
    <Card id="comparison" className="scroll-mt-20">
      <CardHeader
        title="Version comparison"
        description={<span className="inline-flex flex-wrap items-center gap-1"><Link href={`/sources/${previous.id}`} className="text-accent hover:underline">{previous.short}</Link> <ArrowRight className="size-3" /> {current} · {formatNumber(c.counts.previous)} → {formatNumber(c.counts.current)} sections</span>}
        icon={<GitCompareArrows />}
      />
      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {visible.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn("rounded-md border px-2 py-1 text-xs", tab === t.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}
          >
            {t.label} <span className="tabular">{t.n}</span>
          </button>
        ))}
      </div>
      {(tab === "domains" || tab === "segments") && <HeadingTable rows={tab === "domains" ? c.domains : c.segments} />}
      {tab === "added" && <ChangeList items={c.identifiers.added} side="current" />}
      {tab === "removed" && <ChangeList items={c.identifiers.removed} side="previous" />}
      {tab === "changed" && <ChangeList items={c.identifiers.changed} side="both" />}
      <p className="border-t border-border px-4 py-2.5 text-[11px] text-subtle">
        Structural comparison of the two versions as loaded in the library: headings are matched by name and sections by identifier
        (zero-padding ignored). It does not show where a requirement moved. An identifier present in both versions may have been reassigned,
        so a supplied transition mapping takes precedence in {"Version Impact"}.
      </p>
    </Card>
  );
}

function HeadingTable({ rows }: { rows: HeadingRow[] }) {
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface-2">
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="px-4 py-2">Heading</th><th className="px-3 py-2 text-right">Previous</th><th className="px-3 py-2 text-right">Current</th><th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].sort((a, b) => order(a.status) - order(b.status)).map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td className="px-4 py-1.5 text-fg">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular text-fg-2">{r.previous || "—"}</td>
              <td className="px-3 py-1.5 text-right tabular text-fg-2">{r.current || "—"}</td>
              <td className="px-4 py-1.5"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const order = (s: HeadingStatus) => (s === "ONLY_CURRENT" ? 0 : s === "ONLY_PREVIOUS" ? 1 : 2);

const body = (s?: { sectionName: string; sectionText: string | null }) => {
  if (!s) return "";
  const t = s.sectionText ?? "";
  return (t.startsWith(s.sectionName) ? t.slice(s.sectionName.length) : t).trim() || s.sectionName;
};

function ChangeList({ items, side }: { items: SectionChange[]; side: "previous" | "current" | "both" }) {
  const [limit, setLimit] = useState(25);
  if (!items.length) return <p className="px-4 py-6 text-center text-xs text-muted">None.</p>;
  return (
    <div>
      <ul className="max-h-[520px] divide-y divide-border overflow-auto">
        {items.slice(0, limit).map((x) => (
          <li key={x.identifier + (x.current?.sourceSectionId ?? x.previous?.sourceSectionId)} className="px-4 py-2.5 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Mono className="font-medium text-fg">{x.identifier}</Mono>
              {x.previous && <Link href={`/citations?citation=${x.previous.sourceSectionId}`} className="text-muted hover:text-accent">prev <Mono className="text-[11px]">{x.previous.sourceSectionId}</Mono></Link>}
              {x.current && <Link href={`/citations?citation=${x.current.sourceSectionId}`} className="text-muted hover:text-accent">current <Mono className="text-[11px]">{x.current.sourceSectionId}</Mono></Link>}
            </div>
            {side === "both" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-border bg-surface-2 p-2"><div className="mb-0.5 text-[10px] font-semibold uppercase text-subtle">Previous</div><p className="line-clamp-6 whitespace-pre-line text-fg-2">{body(x.previous)}</p></div>
                <div className="rounded border border-border bg-surface-2 p-2"><div className="mb-0.5 text-[10px] font-semibold uppercase text-subtle">Current</div><p className="line-clamp-6 whitespace-pre-line text-fg-2">{body(x.current)}</p></div>
              </div>
            ) : (
              <p className="line-clamp-3 whitespace-pre-line text-fg-2">{body(side === "current" ? x.current : x.previous)}</p>
            )}
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <div className="border-t border-border p-2 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 50)}>Show more ({items.length - limit} remaining)</Button>
        </div>
      )}
    </div>
  );
}
