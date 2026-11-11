import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { ensureConnectors } from "@/lib/connectors/registry";
import { recordControlUpload } from "@/lib/demo/state";
import { confirmImport, IMPORT_KINDS, sha256, type ImportKind } from "@/lib/ingest/persist";
import { readUploadedWorkbook } from "@/lib/ingest/upload";

export const runtime = "nodejs";
export const maxDuration = 300;

const Fields = z.object({ previewJobId: z.string().min(1).max(40) });

/** Commits a previewed workbook. The same file must be re-sent (hash-checked). */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const form = await req.formData();
  const { previewJobId } = Fields.parse({ previewJobId: form.get("previewJobId") });
  const file = await readUploadedWorkbook(form);
  const job = await prisma.importJob.findUnique({ where: { id: previewJobId } });
  if (!job) throw new HttpError(409, "Validation record not found. Upload the file again.");
  if (job.status === "COMPLETED") throw new HttpError(409, "This file has already been imported from this validation. Upload it again to import it a second time.");
  if (job.status !== "PREVIEWED") throw new HttpError(409, "This validation was already used. Upload the file again.");
  if (job.fileHash !== sha256(file.buffer)) throw new HttpError(409, "This file differs from the previewed file.");
  if (!(IMPORT_KINDS as string[]).includes(job.kind)) throw new HttpError(409, "This preview was made with an older import type. Preview the file again.");

  const out = await confirmImport(prisma, job.kind as ImportKind, file, session.sub, { previewJobId });
  // A rejected import is a result, not a server error: it comes back with the findings that blocked it. Nothing was written.
  if (out.status === "FAILED")
    return NextResponse.json({ jobId: out.jobId, status: out.status, kind: job.kind, counts: {}, completedAt: out.completedAt, report: out.report, errors: out.issues.filter((i) => i.severity === "ERROR").slice(0, 50) });
  // Monitoring connectors are linked to documents by family/version; re-link after the library changes.
  if (job.kind === "LIBRARY") await ensureConnectors();
  // Newly uploaded controls point to the version each demo framework is on now.
  if (job.kind === "CLIENT_CONTROLS") await recordControlUpload();
  return NextResponse.json({ jobId: out.jobId, status: out.status, kind: job.kind, counts: out.counts, completedAt: out.completedAt, report: out.report, errors: [] });
});
