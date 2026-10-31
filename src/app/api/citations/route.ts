import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { CitationFilters, citationFacets, listCitations } from "@/lib/queries/citations";
import { searchParamsToObject } from "@/lib/queries/params";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const sp = new URL(req.url).searchParams;
  if (sp.get("view") === "facets") return NextResponse.json(await citationFacets());
  return NextResponse.json(await listCitations(CitationFilters.parse(searchParamsToObject(sp))));
});
