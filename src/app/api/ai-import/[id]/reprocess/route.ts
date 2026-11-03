import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { reprocess } from "@/lib/ai/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Runs the comparison and summary again for a draft awaiting review. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  const r = await reprocess(id, session.sub);
  return NextResponse.json({ status: r.status });
});
