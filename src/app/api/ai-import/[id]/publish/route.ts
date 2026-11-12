import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireWriter } from "@/lib/auth/server";
import { publishIngestion } from "@/lib/ai/ingest";
import { afterPublish } from "@/lib/updates/apply";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(["NEW_VERSION", "NEW_DOCUMENT", "SAME_VERSION"]),
  parentSourceId: z.string().trim().max(20).optional(),
  name: z.string().trim().max(1000).optional(),
  versionLabel: z.string().trim().max(40).optional(),
  targetFrameworkId: z.string().max(40).optional(),
  note: z.string().trim().max(2000).optional(),
});

/** Reviewer publishes the draft into the document library (adds and updates only). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  const result = await publishIngestion(id, Body.parse(await req.json()), session.sub);
  // Mapping-change proposals for affected custom controls, then an immediate check against the publisher.
  return NextResponse.json({ ...result, ...(await afterPublish(id, result.frameworkId, session.sub)) });
});
