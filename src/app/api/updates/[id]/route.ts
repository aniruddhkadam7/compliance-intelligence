import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

const Body = z.object({ reviewStatus: z.enum(["NEW", "ACKNOWLEDGED", "DISMISSED"]), reviewNote: z.string().trim().max(2000).optional() });

/** Review decision on a detected update. Recording a review never alters CCF mappings. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireWriter();
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());
  const existing = await prisma.frameworkUpdate.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Update not found.");
  const [updated] = await prisma.$transaction([
    prisma.frameworkUpdate.update({
      where: { id },
      data: { reviewStatus: body.reviewStatus, reviewNote: body.reviewNote ?? existing.reviewNote, reviewedBy: body.reviewStatus === "NEW" ? null : session.sub, reviewedAt: body.reviewStatus === "NEW" ? null : new Date() },
    }),
    prisma.auditLog.create({
      data: { actor: session.sub, role: session.role, action: "UPDATE_REVIEWED", entity: "FrameworkUpdate", entityId: id, details: { from: existing.reviewStatus, to: body.reviewStatus, note: body.reviewNote ?? null } },
    }),
  ]);
  return NextResponse.json(updated);
});
