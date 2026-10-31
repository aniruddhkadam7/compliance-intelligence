import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { getRequirement } from "@/lib/queries/requirements";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  const r = await getRequirement(id);
  if (!r) throw new HttpError(404, "Integrated requirement not found.");
  return NextResponse.json(r);
});
