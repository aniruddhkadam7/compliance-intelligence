import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { frameworkControls, getFramework } from "@/lib/queries/frameworks";
import { ListParams, searchParamsToObject } from "@/lib/queries/params";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "controls") {
    const p = ListParams.parse(searchParamsToObject(url.searchParams));
    return NextResponse.json(await frameworkControls(id, p));
  }
  const fw = await getFramework(id);
  if (!fw) throw new HttpError(404, "Framework not found.");
  return NextResponse.json(fw);
});
