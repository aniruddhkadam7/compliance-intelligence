import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { revertPublication } from "@/lib/updates/impact";

export const runtime = "nodejs";

/** Rolls back a published version that nothing depends on yet. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  await revertPublication(id, session.sub);
  return NextResponse.json({ ok: true });
});
