import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession, requireWriter } from "@/lib/auth/server";
import { libraryComparisonPairs, recordLibraryComparison } from "@/lib/updates/compare-library";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ previousId: z.string().max(40), currentId: z.string().max(40), refresh: z.boolean().optional() });

/** Consecutive versions of each framework in the library and whether their comparison is recorded. */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await libraryComparisonPairs());
});

/** Compare two versions already in the library, or recompute a comparison whose suggestions are all unreviewed. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const { previousId, currentId, refresh } = Body.parse(await req.json());
  return NextResponse.json(await recordLibraryComparison(previousId, currentId, session.sub, { refresh }));
});
