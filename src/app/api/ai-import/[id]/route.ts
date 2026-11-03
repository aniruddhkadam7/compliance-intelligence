import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireSession, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { draftComparison } from "@/lib/ai/ingest";
import { comparisonSummary } from "@/lib/sources/headings";

export const runtime = "nodejs";

/** Draft detail: identification, library match, sections and the comparison with the matched document. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  const ing = await prisma.aiIngestion.findUnique({
    where: { id },
    select: {
      id: true, fileName: true, status: true, model: true, pages: true, chunks: true, chunksDone: true, detected: true, matchKind: true, matchFrameworkId: true,
      summary: true, analysis: true, usage: true, error: true, createdBy: true, reviewedBy: true, createdAt: true, publishedFrameworkId: true,
      sections: { orderBy: { ordinal: "asc" }, select: { id: true, ordinal: true, identifier: true, title: true, path: true, text: true, verified: true, include: true, contentType: true, parentIdentifier: true, pageNumber: true, sheetName: true, rowNumber: true, confidence: true } },
    },
  });
  if (!ing) throw new HttpError(404, "Draft not found.");
  const match = ing.matchFrameworkId ? await prisma.framework.findUnique({ where: { id: ing.matchFrameworkId }, select: { id: true, name: true, sourceId: true, versionLabel: true, family: true } }) : null;
  const cmp = ing.status === "READY" || ing.status === "PUBLISHED" ? await draftComparison(id) : null;
  // Suggested Parent Source ID for a new document or version: the next free number after the matched one.
  const used = new Set((await prisma.framework.findMany({ select: { sourceId: true } })).map((f) => f.sourceId));
  let n = Number(match?.sourceId) || Math.max(0, ...[...used].map(Number).filter(Number.isFinite));
  do n++; while (used.has(String(n)));
  const { analysis, ...rest } = ing;
  const relationCounts = (analysis as { counts?: Record<string, number> } | null)?.counts ?? null;
  return NextResponse.json({ ...rest, relationCounts, match, suggestedSourceId: String(n), comparison: cmp ? { base: cmp.base, summary: comparisonSummary(cmp.comparison) } : null });
});

const CONTENT_TYPES = ["REQUIREMENT", "RECOMMENDATION", "GUIDANCE", "DEFINITION", "EXAMPLE", "REFERENCE", "SECTION"] as const;
const Patch = z.object({
  include: z.array(z.object({ id: z.string().max(40), include: z.boolean() })).max(5000).optional().default([]),
  types: z.array(z.object({ id: z.string().max(40), contentType: z.enum(CONTENT_TYPES) })).max(5000).optional().default([]),
});

/** Reviewer includes or excludes sections, or corrects their content type. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireWriter();
  const { id } = await ctx.params;
  const body = Patch.parse(await req.json());
  for (const v of [true, false]) {
    const ids = body.include.filter((x) => x.include === v).map((x) => x.id);
    if (ids.length) await prisma.aiDraftSection.updateMany({ where: { ingestionId: id, id: { in: ids } }, data: { include: v } });
  }
  for (const t of body.types) await prisma.aiDraftSection.updateMany({ where: { ingestionId: id, id: t.id }, data: { contentType: t.contentType } });
  return NextResponse.json({ ok: true });
});

/** Discard a draft (kept for the record, never published). */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  const note = z.object({ note: z.string().trim().max(2000).optional() }).parse(await req.json().catch(() => ({}))).note ?? null;
  const ing = await prisma.aiIngestion.findUnique({ where: { id }, select: { status: true } });
  if (!ing) throw new HttpError(404, "Draft not found.");
  if (ing.status === "PUBLISHED") throw new HttpError(409, "A published draft cannot be discarded.");
  await prisma.aiIngestion.update({ where: { id }, data: { status: "REJECTED", reviewedBy: session.sub, reviewedAt: new Date(), reviewNote: note } });
  await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: "AI_IMPORT_REJECTED", entity: "AiIngestion", entityId: id, details: { note } } });
  return NextResponse.json({ ok: true });
});
