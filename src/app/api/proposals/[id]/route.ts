import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { reviewProposal } from "@/lib/queries/relationships";

const Body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(2000).optional() });

/** Human review of a mapping-update proposal. Approval applies it to the client's current mapping. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  const { decision, note } = Body.parse(await req.json());
  const r = await reviewProposal(id, decision, session.sub, note);
  if (!r) throw new HttpError(409, "Proposal not found or already reviewed.");
  return NextResponse.json(r);
});
