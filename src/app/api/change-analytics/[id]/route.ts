import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { versionUpdateDetail } from "@/lib/updates/impact";

export const runtime = "nodejs";

/** Changes, client impact, proposals and analytics for one approved version update. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  return NextResponse.json(await versionUpdateDetail(id));
});
