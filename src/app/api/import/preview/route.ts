import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { parseWorkbook } from "@/lib/ingest/parse";
import { previewCcfWorkbook, sha256 } from "@/lib/ingest/persist";
import { parseTransitionWorkbook } from "@/lib/ingest/transition-workbook";
import { readUploadedWorkbook } from "@/lib/ingest/upload";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Parses and validates an uploaded workbook. Reference data is not modified. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const form = await req.formData();
  const kind = form.get("kind") === "transition" ? "TRANSITION_WORKBOOK" : "CCF_WORKBOOK";
  const file = await readUploadedWorkbook(form);

  if (kind === "CCF_WORKBOOK") {
    const { jobId, result } = await previewCcfWorkbook(prisma, file, session.sub);
    await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: "IMPORT_PREVIEWED", entity: "ImportJob", entityId: jobId, details: { fileName: file.name } } });
    return NextResponse.json({ jobId, kind, sheets: result.sheets, counts: result.counts, issues: result.issues });
  }

  const t = parseTransitionWorkbook(parseWorkbook(file.buffer), file.name);
  const job = await prisma.importJob.create({
    data: {
      kind, fileName: file.name, fileSize: file.buffer.length, fileHash: sha256(file.buffer), status: "PREVIEWED",
      sheets: JSON.parse(JSON.stringify(t.sheets)), counts: { rows: t.rows.length }, actor: session.sub,
      issues: { createMany: { data: t.issues } },
    },
  });
  return NextResponse.json({
    jobId: job.id, kind, sheets: t.sheets, counts: { rows: t.rows.length }, issues: t.issues, columnMap: t.columnMap, isSample: t.isSample,
    rowsPreview: t.rows.slice(0, 8).map((r) => ({ sheet: r.sourceSheet, row: r.sourceRow, values: r.values })),
  });
});
