import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { ControlFilters, controlFacets, listControls } from "@/lib/queries/controls";
import { searchParamsToObject } from "@/lib/queries/params";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const sp = new URL(req.url).searchParams;
  if (sp.get("view") === "facets") return NextResponse.json(await controlFacets());
  return NextResponse.json(await listControls(ControlFilters.parse(searchParamsToObject(sp))));
});
