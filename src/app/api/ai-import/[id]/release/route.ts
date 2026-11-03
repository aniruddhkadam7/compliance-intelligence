import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { releaseDraft } from "@/lib/updates/apply";

export const runtime = "nodejs";

const Body = z.object({ released: z.boolean() });

/** Admin releases (or withdraws) a reviewed new version, so users see an "Update" button on the document. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(["admin"]);
  const { id } = await ctx.params;
  const { released } = Body.parse(await req.json());
  await releaseDraft(id, session.sub, released);
  return NextResponse.json({ released });
});
