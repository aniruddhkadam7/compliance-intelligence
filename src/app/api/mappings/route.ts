import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { mappingPairs, PairFilters, relationshipGraph, sharedRequirementMatrix, unmappedRequirements } from "@/lib/queries/mappings";
import { ListParams } from "@/lib/queries/params";
import { searchParamsToObject } from "@/lib/queries/params";

const GraphParams = z.object({
  source: z.string().min(1).max(40),
  target: z.string().max(40).optional(),
  requirementId: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export const GET = handle(async (req: Request) => {
  await requireSession();
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view");
  if (view === "matrix") return NextResponse.json(await sharedRequirementMatrix());
  if (view === "unmapped") return NextResponse.json(await unmappedRequirements(ListParams.parse(searchParamsToObject(sp))));
  if (view === "graph") return NextResponse.json(await relationshipGraph(GraphParams.parse(searchParamsToObject(sp))));
  return NextResponse.json(await mappingPairs(PairFilters.parse(searchParamsToObject(sp))));
});
