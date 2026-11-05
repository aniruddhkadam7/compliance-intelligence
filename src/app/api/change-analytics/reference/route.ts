import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { listReferenceImpact, referenceImpactDetail } from "@/lib/updates/reference-impact";

export const runtime = "nodejs";

/** Framework update impact on the client's controls: the list, or one update in full with ?key=. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const key = z.string().max(40).optional().parse(new URL(req.url).searchParams.get("key") ?? undefined);
  if (!key) return NextResponse.json(await listReferenceImpact());
  const detail = await referenceImpactDetail(key);
  if (!detail) throw new HttpError(404, "Framework update not found.");
  return NextResponse.json(detail);
});
