import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { ensureConnectors } from "@/lib/connectors/registry";
import { importConnectorContent } from "@/lib/connectors/content";

export const runtime = "nodejs";
// Downloading a full framework (SP 800-53 is about 10 MB) and comparing it with the current version takes a while.
export const maxDuration = 300;

/** "Get new version": download the newest version from the publisher and prepare it as an update. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  await ensureConnectors();
  return NextResponse.json(await importConnectorContent(id, session.sub));
});
