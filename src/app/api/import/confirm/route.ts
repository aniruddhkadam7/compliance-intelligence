import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { parseWorkbook } from "@/lib/ingest/parse";
import { importCcfWorkbook, sha256 } from "@/lib/ingest/persist";
import { parseTransitionWorkbook } from "@/lib/ingest/transition-workbook";
import { readUploadedWorkbook } from "@/lib/ingest/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  if (job.kind === "CCF_WORKBOOK") {
    const out = await importCcfWorkbook(prisma, file, session.sub, { previewJobId });
    if (out.status === "FAILED")
      throw new HttpError(422, "Import rejected: the workbook has blocking validation errors.", out.result.issues.filter((i) => i.severity === "ERROR").slice(0, 50));
    return NextResponse.json({ jobId: out.jobId, status: out.status, counts: out.result.counts });
  }

  const t = parseTransitionWorkbook(parseWorkbook(file.buffer), file.name);
  if (!t.rows.length) throw new HttpError(422, "No transition rows found in the workbook.");
  await prisma.$transaction(async (tx) => {
    await tx.versionTransition.createMany({
      data: t.rows.map((r) => ({
        importJobId: job.id, isSample: t.isSample, sourceSheet: r.sourceSheet, sourceRow: r.sourceRow, raw: r.raw,
        ...Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v ?? null])),
      })),
    });
    await tx.importJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), counts: { rows: t.rows.length } } });
    await tx.auditLog.create({
      data: { actor: session.sub, role: session.role, action: "TRANSITION_IMPORTED", entity: "ImportJob", entityId: job.id, details: { fileName: file.name, rows: t.rows.length, isSample: t.isSample } },
    });
  });
  return NextResponse.json({ jobId: job.id, status: "COMPLETED", counts: { rows: t.rows.length } });
});
