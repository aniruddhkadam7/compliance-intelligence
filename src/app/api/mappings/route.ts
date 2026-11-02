import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { clientImpact, listRelationships, relationshipPairs, RelationshipFilters } from "@/lib/queries/relationships";
import { searchParamsToObject } from "@/lib/queries/params";

const Kind = z.enum(["VERSION_TRANSITION", "CROSS_FRAMEWORK"]);

/** Source relationships: ?view=pairs&kind=..., ?view=impact&from&to, or a paged list. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view");
  if (view === "pairs") return NextResponse.json(await relationshipPairs(Kind.parse(sp.get("kind"))));
  if (view === "impact") return NextResponse.json(await clientImpact(z.string().min(1).parse(sp.get("from")), z.string().min(1).parse(sp.get("to"))));
  return NextResponse.json(await listRelationships(RelationshipFilters.parse(searchParamsToObject(sp))));
});
