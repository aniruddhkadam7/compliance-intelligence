import { NextResponse } from "next/server";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { getDefinition, syncConnector } from "@/lib/connectors/registry";

/** Adopts the latest detected version as the connector's current baseline. CCF mappings are not changed. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  if (!getDefinition(id)) throw new HttpError(404, "Connector not found.");
  try {
    return NextResponse.json(await syncConnector(id, session.sub));
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "Sync failed.");
  }
});
