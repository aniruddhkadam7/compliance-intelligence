"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, RotateCcw, UploadCloud, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/sheet";
import { Mono, SectionTitle } from "@/components/common";
import { ApiError, apiSend } from "@/lib/client/api";
import { cn, formatNumber } from "@/lib/utils";
import { ISSUE_LABELS } from "@/lib/labels";

type Kind = "ccf" | "transition";
interface Issue { severity: "ERROR" | "WARNING" | "INFO"; code: string; sheet?: string; row?: number; column?: string; message: string }
interface SheetSummary { name: string; role: string; headerRow: number | null; headers: string[]; rowCount: number; missingRequired: string[]; preview: Record<string, string | null>[] }
interface Preview {
  jobId: string; kind: string; sheets: SheetSummary[]; counts: Record<string, number>; issues: Issue[];
  columnMap?: Record<string, Record<string, string | null>>; isSample?: boolean;
  rowsPreview?: { sheet: string; row: number; values: Record<string, string | null> }[];
}

const ROLE_LABEL: Record<string, string> = {
  SOURCES: "Frameworks", CITATIONS: "Regulatory obligations", REQUIREMENTS: "Mapping groups", CONTROLS: "CCF controls (authoritative)",
  CONTROLS_WORKING: "CCF working sheet", METRICS: "Validation only", IR_ID_LIST: "Validation only", UNMAPPED_REVIEW: "Unmapped review", UNRECOGNISED: "Not imported",
  PROCEDURE_MAP: "Test procedure mapping", SOURCE_LIST: "Framework list (checked)", SOURCE_METADATA: "Framework details",
};
const COUNT_LABEL: Record<string, string> = {
  frameworks: "Frameworks", citations: "Regulatory obligations", citationLinks: "Obligation links", requirements: "Mapping groups", controls: "CCF controls",
  mappings: "Control mappings (both sheets)", authoritativeMappings: "Authoritative mappings", testProcedures: "Test procedures", evidence: "Evidence statements",
  frameworkReferences: "Framework references", reviews: "Unmapped review rows", rows: "Transition rows",
  procedureLinks: "Test procedure → obligation links", controlObligations: "Control → obligation mappings",
};

export function ImportWizard() {
  const router = useRouter();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("ccf");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [drag, setDrag] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  async function analyse(f: File) {
    setFile(f);
    setPreview(null);
    setBusy("preview");
    const fd = new FormData();
    fd.set("file", f);
    fd.set("kind", kind);
    try {
      const p = await apiSend<Preview>("/api/import/preview", fd);
      setPreview(p);
      setSheet(p.sheets.find((s) => s.role !== "UNRECOGNISED")?.name ?? p.sheets[0]?.name ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed.");
      setFile(null);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!file || !preview) return;
    setConfirmOpen(false);
    setBusy("confirm");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("previewJobId", preview.jobId);
    try {
      const r = await apiSend<{ counts: Record<string, number> }>("/api/import/confirm", fd);
      toast.success(kind === "ccf" ? `Imported ${formatNumber(r.counts.citations)} citations and ${formatNumber(r.counts.controls)} controls.` : `Imported ${r.counts.rows} transition rows.`);
      qc.invalidateQueries();
      reset();
      router.refresh();
      router.push(kind === "ccf" ? "/data?tab=history" : "/version-impact");
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? ` (${e.details.length} errors)` : "";
      toast.error((e instanceof Error ? e.message : "Import failed.") + details);
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  }

  const errors = preview?.issues.filter((i) => i.severity === "ERROR") ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === "WARNING") ?? [];
  const selected = preview?.sheets.find((s) => s.name === sheet);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. Choose workbook type and file" description="Accepted: .xlsx, up to 4 MB (Vercel request limit). The original file is never modified." />
        <CardBody className="space-y-3">
          <div className="grid gap-2">
            {([
              ["ccf", "Framework and control workbook", "Frameworks, regulatory obligations, CCF controls and their mappings. Replaces the current data."],
            ] as const).map(([k, title, desc]) => (
              <button
                key={k}
                disabled={!!busy}
                onClick={() => { setKind(k); reset(); }}
                className={cn("rounded-md border p-3 text-left transition-colors", kind === k ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-border hover:bg-surface-2")}
              >
                <div className="text-[13px] font-semibold text-fg">{title}</div>
                <div className="mt-0.5 text-xs text-muted">{desc}</div>
              </button>
            ))}
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) analyse(f); }}
            className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center transition-colors", drag ? "border-accent bg-accent-soft/40" : "border-border-strong bg-surface-2 hover:bg-surface-3")}
          >
            {busy === "preview" ? <Loader2 className="size-5 animate-spin text-accent" /> : <UploadCloud className="size-5 text-muted" />}
            <div className="text-[13px] font-medium text-fg">{busy === "preview" ? `Analysing ${file?.name}…` : file ? file.name : "Drop an .xlsx file here or click to browse"}</div>
            <div className="text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Worksheets are inspected, headers detected and every row validated before anything is written."}</div>
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) analyse(f); }} />
          </label>
        </CardBody>
      </Card>

      {preview && (
        <>
          {preview.isSample && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              This file is identified as <b className="mx-1">sample data</b> from its name. Rows will be labelled “Sample, not GSK-approved” everywhere they appear.
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="2. Worksheets" description={`${preview.sheets.length} worksheets detected`} />
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted"><th className="px-4 py-2">Worksheet</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Header row</th><th className="px-3 py-2">Columns</th><th className="px-3 py-2">Rows</th><th className="px-4 py-2">Required columns</th></tr></thead>
                  <tbody>
                    {preview.sheets.map((s) => (
                      <tr key={s.name} onClick={() => setSheet(s.name)} className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-surface-2", sheet === s.name && "bg-accent-soft/50")}>
                        <td className="px-4 py-2 font-medium text-fg"><span className="flex items-center gap-2"><FileSpreadsheet className="size-3.5 text-muted" />{s.name}</span></td>
                        <td className="px-3 py-2"><Badge tone={s.role === "UNRECOGNISED" ? "outline" : "neutral"}>{kind === "ccf" ? ROLE_LABEL[s.role] : preview.columnMap?.[s.name] ? "Transition rows" : "Not imported"}</Badge></td>
                        <td className="px-3 py-2 tabular text-fg-2">{s.headerRow ?? "none"}</td>
                        <td className="px-3 py-2 tabular text-fg-2">{s.headers.length}</td>
                        <td className="px-3 py-2 tabular text-fg-2">{formatNumber(s.rowCount)}</td>
                        <td className="px-4 py-2">{s.missingRequired.length ? <Badge tone="danger">Missing {s.missingRequired.length}</Badge> : <CheckCircle2 className="size-3.5 text-success" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected && (
                <div className="border-t border-border p-4">
                  <SectionTitle>Preview · {selected.name}</SectionTitle>
                  <div className="scrollbar-thin overflow-x-auto rounded-md border border-border">
                    <table className="text-left text-xs">
                      <thead><tr className="bg-surface-2">{selected.headers.slice(0, 14).map((h) => <th key={h} className="max-w-[220px] whitespace-nowrap border-b border-border px-2.5 py-1.5 font-semibold text-fg-2">{h.replace(/\n/g, " ").slice(0, 40)}</th>)}</tr></thead>
                      <tbody>
                        {selected.preview.map((r, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            {selected.headers.slice(0, 14).map((h) => <td key={h} className="max-w-[220px] truncate px-2.5 py-1.5 text-fg-2">{r[h] ?? <span className="text-subtle">·</span>}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selected.headers.length > 14 && <p className="mt-1.5 text-[11px] text-muted">Showing 14 of {selected.headers.length} columns. All columns are preserved on import.</p>}
                </div>
              )}
              {kind === "transition" && preview.columnMap && Object.entries(preview.columnMap).map(([name, map]) => (
                <div key={name} className="border-t border-border p-4">
                  <SectionTitle>Detected column mapping · {name}</SectionTitle>
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {Object.entries(map).map(([f, h]) => (
                      <div key={f} className="flex items-center justify-between gap-2 border-b border-border py-1 text-xs">
                        <span className="text-muted">{f}</span>
                        {h ? <Mono className="truncate text-[11px]">{h}</Mono> : <span className="text-subtle">not found</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="3. Records to import" />
                <ul className="divide-y divide-border">
                  {Object.entries(preview.counts).map(([k, v]) => (
                    <li key={k} className="flex justify-between px-4 py-1.5 text-[13px]"><span className="text-fg-2">{COUNT_LABEL[k] ?? k}</span><span className="font-medium tabular">{formatNumber(v)}</span></li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader
                  title="4. Validation"
                  actions={<div className="flex gap-1"><Badge tone={errors.length ? "danger" : "success"}>{errors.length} errors</Badge><Badge tone={warnings.length ? "warning" : "neutral"}>{warnings.length} warnings</Badge></div>}
                />
                <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
                  {preview.issues.slice(0, 80).map((i, n) => (
                    <li key={n} className="flex gap-2 px-4 py-2 text-xs">
                      {i.severity === "ERROR" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" /> : i.severity === "WARNING" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-muted" />}
                      <div className="min-w-0">
                        <div className="font-medium text-fg-2">{ISSUE_LABELS[i.code] ?? i.code}</div>
                        <div className="text-muted">{i.message}</div>
                        {(i.sheet || i.row) && <div className="text-[10.5px] text-subtle">{i.sheet}{i.row ? ` · row ${i.row}` : ""}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
                {preview.issues.length > 80 && <p className="border-t border-border px-4 py-2 text-[11px] text-muted">{preview.issues.length - 80} more issues are available in Data quality after import.</p>}
              </Card>
              <Card>
                <CardBody className="space-y-2">
                  <Button variant="primary" size="lg" className="w-full" disabled={!!busy || errors.length > 0} onClick={() => setConfirmOpen(true)}>
                    {busy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm import
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full" onClick={reset} disabled={!!busy}><RotateCcw /> Choose another file</Button>
                  {errors.length > 0 && <p className="text-center text-xs text-danger">Resolve blocking errors in the workbook before importing.</p>}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={kind === "ccf" ? "Replace reference data?" : "Import transition rows?"}
        description={
          kind === "ccf"
            ? "All frameworks, regulatory obligations, CCF controls and their mappings will be replaced by this workbook in one transaction. Connector history, framework update reviews and the audit log are kept."
            : "Transition rows are added to the Version Impact module. They do not change CCF mappings."
        }
        footer={<><Button onClick={() => setConfirmOpen(false)}>Cancel</Button><Button variant="primary" onClick={confirm}>Import {file?.name}</Button></>}
      />
    </div>
  );
}
