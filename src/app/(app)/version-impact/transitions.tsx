"use client";
import Link from "next/link";
import { diffWords } from "diff";
import { AlertTriangle, ArrowRight, FileSpreadsheet, Info } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Mono, Provenance } from "@/components/common";
import { cn } from "@/lib/utils";
import type { Transition } from "./types";

const SCENARIO = {
  "1": { label: "Scenario 1: mapping unchanged, test procedure needs additional checks", tone: "info" as const },
  "2": { label: "Scenario 2: citation-to-requirement mapping changes", tone: "warning" as const },
  UNKNOWN: { label: "Scenario not determinable from data", tone: "outline" as const },
};

/** Word-level diff. Removed words appear only on the old side, added words only on the new side. */
function DiffText({ oldText, newText, side }: { oldText: string | null; newText: string | null; side: "old" | "new" }) {
  const text = side === "old" ? oldText : newText;
  if (!text) return <span className="text-subtle">Not provided</span>;
  if (!oldText || !newText) return <span className="whitespace-pre-wrap">{text}</span>;
  return (
    <span className="whitespace-pre-wrap">
      {diffWords(oldText, newText).map((p, i) => {
        if (p.added) return side === "new" ? <mark key={i} className="rounded-[2px] bg-success-soft px-0.5 text-success">{p.value}</mark> : null;
        if (p.removed) return side === "old" ? <del key={i} className="rounded-[2px] bg-danger-soft px-0.5 text-danger decoration-danger/60">{p.value}</del> : null;
        return <span key={i}>{p.value}</span>;
      })}
    </span>
  );
}

function changeKind(a: string | null, b: string | null) {
  if (!a && !b) return null;
  if (!a) return { label: "Added", tone: "success" as const };
  if (!b) return { label: "Removed", tone: "danger" as const };
  return a.trim() === b.trim() ? { label: "Unchanged", tone: "neutral" as const } : { label: "Modified", tone: "warning" as const };
}

function Row({ label, a, b, diff }: { label: string; a: string | null; b: string | null; diff?: boolean }) {
  const k = changeKind(a, b);
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-border py-3 last:border-0 md:grid-cols-[180px_1fr_1fr]">
      <div className="flex items-start justify-between gap-2 md:block">
        <div className="text-xs font-medium text-fg-2">{label}</div>
        {k && <Badge tone={k.tone} className="md:mt-1">{k.label}</Badge>}
      </div>
      <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-fg-2">{diff ? <DiffText oldText={a} newText={b} side="old" /> : a ?? <span className="text-subtle">Not provided</span>}</div>
      <div className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-fg">{diff ? <DiffText oldText={a} newText={b} side="new" /> : b ?? <span className="text-subtle">Not provided</span>}</div>
    </div>
  );
}

export function TransitionExamples({ transitions }: { transitions: Transition[] }) {
  if (!transitions.length)
    return (
      <Card>
        <EmptyState
          icon={FileSpreadsheet}
          title="Transition workbook not yet supplied"
          description={
            <>
              The team will provide around five or six verified NIST CSF 2.0 Govern examples traced back to CSF 1.1, with existing and updated test procedures and evidence.
              Until then, this tab stays empty so nothing can be mistaken for GSK-approved content. The other tabs show changes derived from the CCF workbook itself.
            </>
          }
          action={
            <div className="flex gap-2">
              <Button asChild size="sm"><a href="/api/version/template">Download template</a></Button>
              <Button asChild size="sm" variant="primary"><Link href="/data?tab=import">Import workbook</Link></Button>
            </div>
          }
        />
      </Card>
    );

  const counts = { "1": 0, "2": 0, UNKNOWN: 0 };
  transitions.forEach((t) => counts[t.scenarioResolved.code]++);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{transitions.length} transition records</span>
        {(["1", "2", "UNKNOWN"] as const).map((k) => counts[k] > 0 && <Badge key={k} tone={SCENARIO[k].tone}>{SCENARIO[k].label.split(":")[0]} · {counts[k]}</Badge>)}
      </div>
      {transitions.map((t) => {
        const sc = SCENARIO[t.scenarioResolved.code];
        return (
          <Card key={t.id} className={cn(t.isSample && "border-dashed")}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {t.control ? <Link href={`/controls/${encodeURIComponent(t.control.controlName)}`} className="font-mono hover:text-accent">{t.control.controlName}</Link> : <Mono>{t.controlName ?? "Control not stated"}</Mono>}
                  <span className="text-muted">·</span>
                  <span>{t.oldFrameworkVersion ?? "Old version"}</span><ArrowRight className="size-3.5 text-subtle" /><span>{t.newFrameworkVersion ?? "New version"}</span>
                  {t.isSample && <Badge tone="warning"><AlertTriangle /> Sample, not GSK-approved</Badge>}
                </span>
              }
              description={<span className="flex items-center gap-1.5"><Badge tone={sc.tone}>{sc.label}</Badge> <span className="text-[11px]">{t.scenarioResolved.basis}</span></span>}
              actions={<Provenance sheet={t.sourceSheet} row={t.sourceRow} />}
            />
            <CardBody className="py-1">
              <div className="hidden grid-cols-[180px_1fr_1fr] gap-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-subtle md:grid">
                <span />
                <span>Previous ({t.oldFrameworkVersion ?? "old"})</span>
                <span>Updated ({t.newFrameworkVersion ?? "new"})</span>
              </div>
              <Row label="Source section ID" a={t.oldSectionId} b={t.newSectionId} />
              <Row label="Function / domain" a={t.previousFunction} b={t.newFunction} />
              <Row label="Citation" a={t.previousCitation} b={t.updatedCitation} diff />
              <Row label="Mapped requirement (workbook)" a={t.oldRequirements.length ? `IR ${t.oldRequirements.join(", ")}` : null} b={t.newRequirements.length ? `IR ${t.newRequirements.join(", ")}` : null} />
              <Row label="Test procedure statement" a={t.existingTestProcedure} b={t.updatedTestProcedure} diff />
              <Row label="Evidence" a={t.existingEvidence} b={[t.existingEvidence, t.additionalEvidence].filter(Boolean).join("\n\n") || null} diff />
              {t.previousFunction && t.newFunction && t.previousFunction !== t.newFunction && (
                <div className="my-3 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
                  <Info className="mt-0.5 size-3.5 shrink-0" /> Scope expansion: the requirement moves from {t.previousFunction} to {t.newFunction}.
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

