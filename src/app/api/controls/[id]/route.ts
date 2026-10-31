import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { getControl } from "@/lib/queries/controls";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  const c = await getControl(decodeURIComponent(id));
  if (!c) throw new HttpError(404, "Control not found.");
  return NextResponse.json(c);
});
