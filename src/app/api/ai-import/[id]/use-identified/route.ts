import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { switchToIdentifiedDocument } from "@/lib/ai/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/** The file is a different document than the one chosen for the upload: switch the draft to the identified document. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  const r = await switchToIdentifiedDocument(id, session.sub);
  return NextResponse.json({ status: r.status });
});
