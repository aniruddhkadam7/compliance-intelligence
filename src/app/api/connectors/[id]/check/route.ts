import { NextResponse } from "next/server";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { ensureConnectors, getDefinition, runConnectorCheck } from "@/lib/connectors/registry";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Manual "Check now". Records results and detected updates for review. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  if (!getDefinition(id)) throw new HttpError(404, "Connector not found.");
  await ensureConnectors();
  return NextResponse.json(await runConnectorCheck(id, { trigger: "MANUAL", actor: session.sub }));
});
