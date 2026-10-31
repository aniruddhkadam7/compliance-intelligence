import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { compareVersions } from "@/lib/queries/version";

const Body = z.object({ fromId: z.string().min(1).max(40), toId: z.string().min(1).max(40) }).refine((b) => b.fromId !== b.toId, "Choose two different versions.");

export const POST = handle(async (req: Request) => {
  await requireSession();
  const { fromId, toId } = Body.parse(await req.json());
  const result = await compareVersions(fromId, toId);
  if (!result) throw new HttpError(404, "Framework version not found.");
  return NextResponse.json(result);
});
