import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { checkForUpdates } from "@/lib/updates/check";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Checks the publisher's official source for a newer version of this framework and records the evidence. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  return NextResponse.json(await checkForUpdates(id, session.sub));
});
