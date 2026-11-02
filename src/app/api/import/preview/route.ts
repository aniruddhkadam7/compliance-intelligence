import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { IMPORT_KINDS, previewImport } from "@/lib/ingest/persist";
import { readUploadedWorkbook } from "@/lib/ingest/upload";

export const runtime = "nodejs";
export const maxDuration = 60;

const Kind = z.enum(IMPORT_KINDS as [string, ...string[]]);

/** Parses and validates an uploaded workbook for one import path. Nothing is written. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const form = await req.formData();
  const kind = Kind.parse(form.get("kind")) as (typeof IMPORT_KINDS)[number];
  const file = await readUploadedWorkbook(form);
  const p = await previewImport(prisma, kind, file, session.sub);
  await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: "IMPORT_PREVIEWED", entity: "ImportJob", entityId: p.jobId, details: { kind, fileName: file.name } } });
  return NextResponse.json(p);
});
