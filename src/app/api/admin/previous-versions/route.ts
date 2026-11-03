import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { fillPreviousVersions } from "@/lib/sources/previous-versions";

export const runtime = "nodejs";

const Body = z.object({ apply: z.boolean() });

/** Admin fills the researched previous-version records (empty fields only; never deletes). apply=false previews. */
export const POST = handle(async (req: Request) => {
  const session = await requireSession(["admin"]);
  const { apply } = Body.parse(await req.json());
  const r = await fillPreviousVersions(apply);
  if (apply && r.changes.length)
    await prisma.auditLog.create({ data: { actor: session.sub, action: "PREVIOUS_VERSIONS_FILLED", entity: "Framework", entityId: "library", details: { changes: r.changes } } });
  return NextResponse.json(r);
});
