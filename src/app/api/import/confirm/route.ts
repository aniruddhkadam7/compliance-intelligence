import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { ensureConnectors } from "@/lib/connectors/registry";
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
  if (!job || job.status !== "PREVIEWED") throw new HttpError(409, "Preview not found or already used. Preview the file again.");
  if (job.fileHash !== sha256(file.buffer)) throw new HttpError(409, "This file differs from the previewed file.");
  if (!(IMPORT_KINDS as string[]).includes(job.kind)) throw new HttpError(409, "This preview was made with an older import type. Preview the file again.");

  const out = await confirmImport(prisma, job.kind as ImportKind, file, session.sub, { previewJobId });
  if (out.status === "FAILED")
    throw new HttpError(422, "Import rejected: the workbook has blocking validation errors.", out.issues.filter((i) => i.severity === "ERROR").slice(0, 50));
  // Monitoring connectors are linked to documents by family/version; re-link after the library changes.
  if (job.kind === "LIBRARY") await ensureConnectors();
  return NextResponse.json({ jobId: out.jobId, status: out.status, kind: job.kind, counts: out.counts });
});
