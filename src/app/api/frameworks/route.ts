import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { FrameworkFilters, frameworkFacets, listFrameworks } from "@/lib/queries/frameworks";
import { searchParamsToObject } from "@/lib/queries/params";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const f = FrameworkFilters.parse(searchParamsToObject(new URL(req.url).searchParams));
  const [items, facets] = await Promise.all([listFrameworks(f), frameworkFacets()]);
  return NextResponse.json({ items, total: items.length, facets });
});
