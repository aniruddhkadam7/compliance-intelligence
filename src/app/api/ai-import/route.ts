import { NextResponse } from "next/server";
import { handle, HttpError, requireSession, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { aiConfigured, AI_MODEL } from "@/lib/ai/openai";
import { readUploadedDocument } from "@/lib/ai/extract-text";
import { startIngestion } from "@/lib/ai/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/** AI-assisted imports: list of drafts, plus whether AI is configured. */
export const GET = handle(async () => {
  await requireSession();
  const items = await prisma.aiIngestion.findMany({
    orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, fileName: true, status: true, model: true, pages: true, chunks: true, chunksDone: true, detected: true, matchKind: true, createdBy: true, createdAt: true, publishedFrameworkId: true, error: true, _count: { select: { sections: true } } },
  });
  return NextResponse.json({ configured: aiConfigured(), model: AI_MODEL(), items });
});

/** Upload a document: text is extracted and the document identified; section extraction follows in steps. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  if (!aiConfigured()) throw new HttpError(503, "AI is not configured on this deployment.");
  const form = await req.formData();
  const file = await readUploadedDocument(form);
  const frameworkId = form.get("frameworkId");
  const expected = form.get("expectedVersion");
  const target = typeof frameworkId === "string" && frameworkId ? { frameworkId: frameworkId.slice(0, 40), expectedVersion: typeof expected === "string" ? expected.slice(0, 80) : null } : undefined;
  const ing = await startIngestion(file, session.sub, target);
  return NextResponse.json({ id: ing.id, chunks: ing.chunks, detected: ing.detected, matchKind: ing.matchKind });
});
