import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { resetData, RESET_SCOPES } from "@/lib/ingest/reset";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  scopes: z.array(z.enum(RESET_SCOPES)).min(1, "Choose at least one item to reset."),
  confirm: z.literal("RESET", { message: 'Type "RESET" to confirm.' }),
});

/** Admin-only: removes uploaded data. Audit log and import history are preserved. */
export const POST = handle(async (req: Request) => {
  const session = await requireSession(["admin"]);
  const { scopes } = Body.parse(await req.json());
  const counts = await resetData(prisma, [...new Set(scopes)], session.sub, session.role);
  return NextResponse.json({ ok: true, scopes, counts });
});

/** Current record counts, shown on the reset screen. */
export const GET = handle(async () => {
  await requireSession();
  const [frameworks, citations, requirements, controls, transitions, updates, checks] = await Promise.all([
    prisma.framework.count(),
    prisma.citation.count(),
    prisma.integratedRequirement.count(),
    prisma.ccfControl.count(),
    prisma.versionTransition.count(),
    prisma.frameworkUpdate.count(),
    prisma.connectorCheck.count(),
  ]);
  return NextResponse.json({ frameworks, citations, requirements, controls, transitions, updates, checks });
});
