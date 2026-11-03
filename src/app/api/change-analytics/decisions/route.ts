import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireWriter } from "@/lib/auth/server";
import { reviewProposal } from "@/lib/queries/relationships";

export const runtime = "nodejs";

const Body = z.object({ ids: z.array(z.string().max(40)).min(1).max(2000), decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(2000).optional() });

/** Approve or reject selected mapping proposals. Each decision is applied and audited on its own. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const { ids, decision, note } = Body.parse(await req.json());
  let applied = 0;
  for (const id of ids) if (await reviewProposal(id, decision, session.sub, note)) applied++;
  return NextResponse.json({ applied, skipped: ids.length - applied });
});
