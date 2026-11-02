import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireWriter } from "@/lib/auth/server";
import { proposeFromTransitions } from "@/lib/queries/relationships";

const Body = z.object({ from: z.string().min(1).max(40), to: z.string().min(1).max(40) });

/** Creates pending mapping-update proposals from a legacy → latest transition. Nothing is applied. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const { from, to } = Body.parse(await req.json());
  return NextResponse.json(await proposeFromTransitions(from, to, session.sub));
});
