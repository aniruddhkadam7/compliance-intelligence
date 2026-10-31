import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  const c = await prisma.connector.findUnique({
    where: { id },
    include: { checks: { orderBy: { checkedAt: "desc" }, take: 30 }, updates: { orderBy: { detectedAt: "desc" }, take: 30 } },
  });
  if (!c) throw new HttpError(404, "Connector not found.");
  const { state: _state, ...rest } = c;
  void _state;
  return NextResponse.json(rest);
});
