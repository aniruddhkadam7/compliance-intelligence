import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { getCitation } from "@/lib/queries/citations";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  const c = await getCitation(id);
  if (!c) throw new HttpError(404, "Citation not found.");
  return NextResponse.json(c);
});
