import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { applyReleasedUpdate } from "@/lib/updates/apply";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Update" on a document: installs the version an admin released; the previous version stays in the library. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  return NextResponse.json(await applyReleasedUpdate(id, session.sub));
});
