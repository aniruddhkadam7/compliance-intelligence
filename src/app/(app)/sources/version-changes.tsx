"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/client/api";
import { cn, formatNumber } from "@/lib/utils";
import { KIND } from "../change-analytics/change-analytics";

type Kind = keyof typeof KIND;
interface Ref { short: string; version: string | null }
/** An AI review of the change (see src/lib/ai/review-changes.ts): the nature of a modification, or why sections were linked. */
interface Review { by: "AI"; model: string; nature?: "EDITORIAL" | "SUBSTANTIVE" | "REASSIGNED"; reason: string }
interface Change { kind: Kind; from: string[]; to: string[]; explanation: string; review?: Review; before: { id: string; text: string | null }[]; after: { id: string; title: string; text: string }[] }

const NATURE = {
  EDITORIAL: { label: "Wording only", tone: "neutral" },
  SUBSTANTIVE: { label: "Obligation changed", tone: "warning" },
  REASSIGNED: { label: "Different obligation", tone: "danger" },
} as const;
interface Detail { previous: Ref | null; current: Ref | null; counts: Partial<Record<Kind, number>> | null; summary: string | null; relations: Change[] }

const ORDER: Kind[] = ["ADDED", "MODIFIED", "RENUMBERED", "SPLIT", "COMBINED", "REMOVED"];
const PAGE = 12;
const vname = (r: Ref | null) => (!r ? "the previous version" : r.version && !r.short.includes(r.version) ? `${r.short} ${r.version}` : r.short);
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (s: string) => [...s].reduce((n, c, i) => (ROMAN[c] < (ROMAN[s[i + 1]] ?? 0) ? n - ROMAN[c] : n + ROMAN[c]), 0);
/** Document order: articles by number, then annexes by Roman numeral; other identifiers naturally ("AC-2" < "AC-10"). */
function byDocumentOrder(x: string, y: string) {
  const key = (s: string) => {
    const annex = s.match(/^Annex\s+([IVXLC]+)\b/i);
    return annex ? `2${String(roman(annex[1].toUpperCase())).padStart(4, "0")}${s}` : /^Article\b/i.test(s) ? `1${s}` : `0${s}`;
  };
  return key(x).localeCompare(key(y), undefined, { numeric: true });
}
const clip = (s: string | null | undefined, n: number) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** What changed between this document and the version it replaced: counts, summary and each changed section. */
export function VersionChanges({ ingestionId }: { ingestionId: string }) {
  const q = useQuery({ queryKey: ["version-changes", ingestionId], queryFn: () => apiGet<Detail>(`/api/change-analytics/${ingestionId}`) });
  const [kind, setKind] = useState<Kind | null>(null);
  const [limit, setLimit] = useState(PAGE);
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (!q.data) return null;
  const d = q.data, counts = d.counts ?? {};
  const kinds = ORDER.filter((k) => (counts[k] ?? 0) > 0);
  const active = kind && kinds.includes(kind) ? kind : kinds[0];
  const first = (r: Change) => (r.kind === "REMOVED" ? r.from[0] : r.to[0]) ?? "";
  const list = d.relations.filter((r) => r.kind === active).sort((x, y) => byDocumentOrder(first(x), first(y)));
  const [summary, ...highlights] = (d.summary ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const modified = d.relations.filter((r) => r.kind === "MODIFIED");
  const nature = (n: keyof typeof NATURE) => modified.filter((r) => r.review?.nature === n).length;

  return (
    <div className="rounded-md border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompare className="size-4 text-accent" />
        <span className="font-semibold text-fg">What changed</span>
        <span className="text-muted">{vname(d.previous)} <ArrowRight className="inline size-3" /> {vname(d.current)}</span>
        <Button asChild size="sm" variant="ghost" className="ml-auto"><Link href={`/change-analytics?update=${ingestionId}`}>Full analysis in Change Analytics <ArrowRight /></Link></Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...ORDER, "UNCHANGED" as Kind].filter((k) => (counts[k] ?? 0) > 0).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5">
            <span className="size-2 rounded-full" style={{ background: KIND[k].color }} />{KIND[k].label} <b className="tabular text-fg">{formatNumber(counts[k] ?? 0)}</b>
            {k === "MODIFIED" && modified.some((r) => r.review?.nature) && (
              <span className="text-muted">({[nature("SUBSTANTIVE") && `${nature("SUBSTANTIVE")} obligation changed`, nature("EDITORIAL") && `${nature("EDITORIAL")} wording only`, nature("REASSIGNED") && `${nature("REASSIGNED")} different requirement`].filter(Boolean).join(", ")})</span>
            )}
          </span>
        ))}
      </div>

      {summary && (
        <div className="mt-3">
          <p className="text-fg-2">{summary.startsWith("AI change summary unavailable") ? "No written summary is available for this update; the obligation changes are listed below." : summary}</p>
          {highlights.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg-2">{highlights.map((h) => <li key={h}>{h.replace(/^•\s*/, "")}</li>)}</ul>}
        </div>
      )}

      {kinds.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Change type">
            {kinds.map((k) => (
              <button key={k} role="tab" aria-selected={k === active} onClick={() => { setKind(k); setLimit(PAGE); }} className={cn("rounded px-2.5 py-1", k === active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg")}>
                {KIND[k].label} ({formatNumber(counts[k] ?? 0)})
              </button>
            ))}
          </div>
          <ul className="mt-2 divide-y divide-border rounded border border-border">
            {list.slice(0, limit).map((r) => {
              const ids = r.kind === "REMOVED" ? r.from : r.to;
              const title = r.after.map((a) => a.title).find(Boolean);
              const after = r.after.map((a) => a.text).find(Boolean);
              const before = r.before.map((b) => b.text).find(Boolean);
              return (
                <li key={`${r.from.join()}>${r.to.join()}`} className="px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono font-semibold text-fg">{ids.join(", ")}</span>
                    {(r.kind === "RENUMBERED" || r.kind === "SPLIT" || r.kind === "COMBINED") && <span className="text-muted">was {r.from.join(", ")}</span>}
                    <Badge tone={KIND[r.kind].tone}>{KIND[r.kind].label}</Badge>
                    {r.review?.nature && <Badge tone={NATURE[r.review.nature].tone}>{NATURE[r.review.nature].label}</Badge>}
                    {r.review && !r.review.nature && <Badge tone="info" title={`Linked by AI review (${r.review.model}); verify before relying on it`}>AI-matched</Badge>}
                    {r.kind !== "ADDED" && r.kind !== "REMOVED" && <span className="text-subtle">{r.explanation}</span>}
                  </div>
                  {r.review?.nature && <p className="mt-0.5 text-muted"><span className="font-medium text-fg-2">AI review:</span> {r.review.reason} <span className="text-subtle">· verify before relying on it</span></p>}
                  {title && <div className="mt-0.5 font-medium text-fg-2">{title}</div>}
                  {r.kind === "REMOVED"
                    ? before && <p className="mt-0.5 text-muted line-through decoration-danger/50">{clip(before, 260)}</p>
                    : after && <p className="mt-0.5 text-fg-2">{r.kind !== "ADDED" && before && <span className="font-medium text-fg">Now: </span>}{clip(after, 280)}</p>}
                  {r.kind !== "ADDED" && r.kind !== "REMOVED" && before && <p className="mt-0.5 text-muted"><span className="font-medium">Before: </span>{clip(before, 220)}</p>}
                </li>
              );
            })}
          </ul>
          {list.length > limit && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setLimit(limit + 50)}>Show more ({formatNumber(list.length - limit)} remaining)</Button>}
        </div>
      )}
    </div>
  );
}
