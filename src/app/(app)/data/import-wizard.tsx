"use client";
// Custom control import: Upload → Validate → Review → Confirm Import.
//   Upload and Validate   the file is sent to the server and analysed. Nothing in the platform changes; only an import
//                         record in status "Validated" is kept, so the attempt shows in Import history.
//   Review                one status for the file (ready, already imported, or the blocking errors to fix) and what it
//                         holds. Per-worksheet detail and warnings are not shown here (team feedback: keep it simple).
//   Confirm Import        the database import, in one transaction. The result shows the records counted back from the
//                         database after the write, or why the import was rejected (nothing written).
import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, Database, FileSearch, FileSpreadsheet, Info, Loader2, RotateCcw, UploadCloud, XCircle,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";
import { apiSend } from "@/lib/client/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { ISSUE_LABELS } from "@/lib/labels";
import { ClientControlActions } from "@/components/client-control-actions";
import { UploadFromCloud } from "@/components/upload-folder-link";

interface Issue { severity: "ERROR" | "WARNING" | "INFO"; code: string; sheet?: string; row?: number; column?: string; message: string }
interface SheetSummary { name: string; headers: string[]; preview: Record<string, string | null>[] }
type SheetStatus = "IMPORTED" | "CHECKED" | "SKIPPED" | "BLOCKED";
interface SheetReport {
  name: string; roleLabel: string; status: SheetStatus; reason: string | null; headerRow: number | null; headers: number; rows: number;
  missingColumns: string[]; columnProblems: { column: string; severity: "ERROR" | "WARNING"; rows: number; message: string }[]; errors: number; warnings: number;
}
interface Report {
  sheets: SheetReport[]; outcome: "READY" | "ACTION_NEEDED"; errors: number; warnings: number;
  summary: { worksheets: number; imported: number; checked: number; skipped: number; blocked: number; rows: number; headers: number };
}
interface Preview {
  jobId: string; fileName: string; fileSize: number; uploadedAt: string; sheets: SheetSummary[]; counts: Record<string, number>; issues: Issue[]; report: Report;
  isSample?: boolean;
  /** This exact file was imported before and its data is still in the platform. */
  alreadyImported: { jobId: string; completedAt: string; actor: string; counts: Record<string, number> } | null;
}
interface Result { jobId: string; status: "COMPLETED" | "FAILED"; counts: Record<string, number>; completedAt: string; errors: Issue[] }

const COUNT_LABEL: Record<string, string> = {
  controls: "Controls", testProcedures: "Test procedures (mapped)", procedureStatements: "Procedure statements on controls", procedureLinks: "Test procedure → obligation links", controlObligations: "Control → obligation mappings",
  evidence: "Evidence statements", crossFramework: "Framework relationships", versionTransitions: "Version transitions", libraryDocuments: "Library documents",
  librarySections: "Library sections (obligations)", documentsRenumbered: "Documents renumbered", documentsAdded: "New documents", frameworks: "Library documents written",
  sectionsWritten: "Library sections written", sectionsAdded: "Library sections added", sectionsUpdated: "Library sections updated", replacedControls: "Previous controls replaced",
  citations: "Obligations", requirements: "Mapping groups", reviews: "Unmapped review rows", frameworkReferences: "Framework references", rows: "Rows",
};
const STEPS = ["Upload", "Validate", "Review", "Confirm import"] as const;

/** Where the import is: 0 choose a file, 1 validating, 2 review, 3 importing, 4 finished. `failedAt`: the step that failed. */
function Stepper({ at, failedAt }: { at: number; failedAt: number | null }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      {STEPS.map((label, i) => {
        const bad = failedAt === i;
        const done = !bad && (failedAt === null || i < failedAt) && (at > i || at === 4);
        const current = at === i;
        return (
          <Fragment key={label}>
            {i > 0 && <ArrowRight className="size-3 text-subtle" />}
            <li className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", bad ? "border-danger/40 bg-danger-soft text-danger" : done ? "border-success/30 bg-success-soft text-success" : current ? "border-border-strong bg-surface-3 font-medium text-fg" : "border-border text-muted")}>
              <span className="grid size-4 place-items-center rounded-full text-[10px] font-semibold">{bad ? <XCircle className="size-3.5" /> : done ? <Check className="size-3.5" /> : i + 1}</span>
              {label}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[17px] font-semibold tabular text-fg">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** Counts as a two-column list, in a fixed, readable order. */
function CountList({ counts }: { counts: Record<string, number> }) {
  const keys = Object.keys(COUNT_LABEL).filter((k) => counts[k] !== undefined);
  return (
    <ul className="grid gap-x-6 sm:grid-cols-2">
      {keys.map((k) => <li key={k} className="flex justify-between border-b border-border py-1.5 text-[13px] last:border-0"><span className="text-fg-2">{COUNT_LABEL[k]}</span><span className="font-medium tabular">{formatNumber(counts[k])}</span></li>)}
    </ul>
  );
}

export function ImportWizard() {
  const router = useRouter();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [drag, setDrag] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function validate(f: File) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setUploadError(null);
    setBusy("preview");
    const fd = new FormData();
    fd.set("file", f);
    fd.set("kind", "CLIENT_CONTROLS");
    try {
      const p = await apiSend<Preview>("/api/import/preview", fd);
      setPreview(p);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "The file could not be validated.");
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["imports"] });
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
      const r = await apiSend<Result>("/api/import/confirm", fd);
      setResult(r);
      if (r.status === "COMPLETED") {
        toast.success(`Import complete: ${formatNumber(r.counts.controls ?? 0)} controls written`);
        qc.invalidateQueries();
        router.refresh();
      } else toast.error("Import rejected: nothing was written");
    } catch (e) {
      // The server could not run the import at all (e.g. the validation was already used); nothing was written.
      setResult({ jobId: preview.jobId, status: "FAILED", counts: {}, completedAt: new Date().toISOString(), errors: [{ severity: "ERROR", code: "IMPORT_FAILED", message: e instanceof Error ? e.message : "Import failed." }] });
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setUploadError(null);
    if (input.current) input.current.value = "";
  }

  const report = preview?.report;
  const blocking = preview?.issues.filter((i) => i.severity === "ERROR") ?? [];
  const step = result ? 4 : busy === "confirm" ? 3 : preview ? 2 : busy === "preview" ? 1 : 0;
  // Upload/validation could not run → Validate; blocking errors → Review; rejected by the import → Confirm import.
  const failedAt = uploadError ? 1 : result?.status === "FAILED" ? 3 : report?.outcome === "ACTION_NEEDED" ? 2 : null;
  const relationships = (preview?.counts.crossFramework ?? 0) + (preview?.counts.versionTransitions ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Import custom controls"
          description="Uploading validates the file only: nothing in the platform changes until you select Confirm import."
          actions={<ClientControlActions empty={false} showUpload={false} />}
        />
        <CardBody className="space-y-4">
          <Stepper at={uploadError ? 1 : step} failedAt={failedAt} />
          {!result && (
            <div className="grid gap-3 md:grid-cols-2">
              <UploadFromCloud />
              <label
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && !busy) validate(f); }}
                className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center transition-colors", drag ? "border-accent bg-accent-soft/40" : "border-border-strong bg-surface-2 hover:bg-surface-3")}
              >
                {busy === "preview" ? <Loader2 className="size-5 animate-spin text-accent" /> : <UploadCloud className="size-5 text-muted" />}
                <div className="text-[13px] font-medium text-fg">{busy === "preview" ? `Validating ${file?.name}…` : file ? file.name : "Drop the .xlsx file here, or click to browse"}</div>
                <div className="text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "From the shared folder or your computer. Excel template (.xlsx), up to 4 MB."}</div>
                <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) validate(f); }} />
              </label>
            </div>
          )}
          {uploadError && (
            <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              <XCircle className="mt-0.5 size-4 shrink-0" /><span><b>The file could not be validated.</b> {uploadError} Nothing was imported.</span>
            </div>
          )}
        </CardBody>
      </Card>

      {result && preview && <ResultCard result={result} preview={preview} onAnother={reset} />}

      {preview && report && !result && (
        <>
          {/* One status for the whole file; the detail of what was read is kept out of the way. */}
          <div className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3",
            preview.alreadyImported ? "border-success/30 bg-success-soft" : report.outcome === "READY" ? "border-info/30 bg-info-soft" : "border-danger/30 bg-danger-soft")}>
            {preview.alreadyImported ? <CheckCircle2 className="mt-0.5 size-5 text-success" /> : report.outcome === "READY" ? <FileSearch className="mt-0.5 size-5 text-info" /> : <XCircle className="mt-0.5 size-5 text-danger" />}
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="font-semibold text-fg">
                {preview.alreadyImported ? "Import complete: this file is already in the platform"
                  : report.outcome === "READY" ? "Ready to import" : "Action needed: the file cannot be imported"}
              </div>
              <div className="mt-0.5 text-fg-2">
                <FileSpreadsheet className="mr-1 inline size-3.5 align-[-2px] text-muted" />{preview.fileName} · uploaded {formatDateTime(preview.uploadedAt)}
              </div>
              {preview.alreadyImported && <div className="mt-0.5 text-xs text-muted">Imported {formatDateTime(preview.alreadyImported.completedAt)} by {preview.alreadyImported.actor}.</div>}
              {report.outcome !== "READY" && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-danger">
                  {blocking.slice(0, 5).map((i, n) => <li key={n}>{i.message}{i.sheet ? ` (${i.sheet}${i.row ? `, row ${i.row}` : ""})` : ""}</li>)}
                  {blocking.length > 5 && <li className="list-none text-muted">and {blocking.length - 5} more. Fix the workbook and upload it again.</li>}
                </ul>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={reset} disabled={!!busy}><RotateCcw /> Choose another file</Button>
          </div>
          {preview.isSample && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              This file is identified as <b className="mx-1">sample data</b> from its name. Rows will be labelled “Sample, not GSK-approved” everywhere they appear.
            </div>
          )}

          {report.outcome === "READY" && (
            <Card>
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                <Tile label="Worksheets read" value={report.summary.imported + report.summary.checked} sub={`of ${report.summary.worksheets} in the file`} />
                <Tile label="Custom controls" value={formatNumber(preview.counts.controls ?? 0)} />
                <Tile label="Test procedures" value={formatNumber(preview.counts.testProcedures ?? 0)} />
                <Tile label="Framework relationships" value={formatNumber(relationships)} />
              </div>
              <CardBody className="flex flex-wrap items-center gap-3 border-t border-border">
                {preview.alreadyImported ? (
                  <>
                    <Button asChild variant="primary"><Link href="/controls">Open Custom Control Mapping <ArrowRight /></Link></Button>
                    <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmOpen(true)}><RotateCcw /> Import this file again</Button>
                  </>
                ) : (
                  <>
                    <Button variant="primary" size="lg" disabled={!!busy} onClick={() => setConfirmOpen(true)}>
                      {busy === "confirm" ? <><Loader2 className="animate-spin" /> Importing…</> : <><Database /> Confirm import</>}
                    </Button>
                    <span className="text-xs text-muted">Nothing has been imported yet. Confirm import writes the file to the platform.</span>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={preview?.alreadyImported ? "Import this file again?" : "Confirm import?"}
        description={preview?.counts.libraryDocuments !== undefined
          ? "This workbook also carries the document library and framework relationships. The library is updated first (documents matched by name; renumbered Source IDs are re-keyed, nothing is deleted), the framework relationships in the file replace the current ones, then the custom controls and mappings are replaced. The previous mapping is recorded in Import history. Approved mapping decisions in Change Analytics are reset for the new upload."
          : "The current custom controls and mappings are replaced by this file. The previous mapping is recorded in Import history; the global document library is not affected."}
        footer={<><Button onClick={() => setConfirmOpen(false)}>Cancel</Button><Button variant="primary" onClick={confirm}><Database /> Import {file?.name}</Button></>}
      />
    </div>
  );
}

function IssueRow({ i }: { i: Issue }) {
  return (
    <li className="flex gap-2 px-4 py-2 text-xs">
      {i.severity === "ERROR" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" /> : i.severity === "WARNING" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-muted" />}
      <div className="min-w-0">
        <div className="font-medium text-fg-2">{ISSUE_LABELS[i.code] ?? i.code}</div>
        <div className="text-muted">{i.message}</div>
        {(i.sheet || i.row || i.column) && <div className="text-[10.5px] text-subtle">{i.sheet}{i.row ? ` · row ${i.row}` : ""}{i.column ? ` · column “${i.column.replace(/\s+/g, " ").slice(0, 40)}”` : ""}</div>}
      </div>
    </li>
  );
}

/** The outcome of Confirm import: what was written (counted from the database), or why nothing was. */
function ResultCard({ result, preview, onAnother }: { result: Result; preview: Preview; onAnother: () => void }) {
  const ok = result.status === "COMPLETED";
  return (
    <Card className={ok ? "border-success/40" : "border-danger/40"}>
      <div className={cn("flex flex-wrap items-start gap-3 border-b px-4 py-3", ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft")}>
        {ok ? <CheckCircle2 className="mt-0.5 size-5 text-success" /> : <XCircle className="mt-0.5 size-5 text-danger" />}
        <div className="min-w-0 flex-1 text-[13px]">
          <div className="font-semibold text-fg">{ok ? "Import complete" : "Import failed: nothing was written"}</div>
          <div className="text-fg-2">{preview.fileName} · {ok ? "imported" : "attempted"} {formatDateTime(result.completedAt)} · uploaded {formatDateTime(preview.uploadedAt)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ok && <Button asChild size="sm" variant="primary"><Link href="/controls">Open Custom Control Mapping <ArrowRight /></Link></Button>}
          <Button size="sm" onClick={onAnother}><UploadCloud /> {ok ? "Import another file" : "Upload a corrected file"}</Button>
        </div>
      </div>
      <CardBody>
        {ok ? (
          <>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Written to the database</div>
            <CountList counts={result.counts} />
            <p className="mt-2 text-[11px] text-muted">Counted from the database after the import. Details are in Import history and the Audit log.</p>
          </>
        ) : (
          <ul className="divide-y divide-border">{result.errors.map((i, n) => <IssueRow key={n} i={i} />)}</ul>
        )}
      </CardBody>
    </Card>
  );
}
