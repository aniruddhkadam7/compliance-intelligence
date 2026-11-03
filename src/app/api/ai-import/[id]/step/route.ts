import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { processNextChunk } from "@/lib/ai/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Processes one chunk of the document; the client calls this until the draft is READY. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireWriter();
  const { id } = await ctx.params;
  const r = await processNextChunk(id);
  return NextResponse.json({ status: r.status, chunks: r.chunks, chunksDone: r.chunksDone, error: r.error });
});
