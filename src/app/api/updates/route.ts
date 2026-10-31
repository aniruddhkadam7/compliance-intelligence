import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { searchParamsToObject } from "@/lib/queries/params";

const Params = z.object({
  status: z.enum(["", "NEW", "ACKNOWLEDGED", "DISMISSED"]).optional().default(""),
  connectorId: z.string().max(60).optional().default(""),
  changeType: z.string().max(40).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const GET = handle(async (req: Request) => {
  await requireSession();
  const p = Params.parse(searchParamsToObject(new URL(req.url).searchParams));
  const where = {
    ...(p.status && { reviewStatus: p.status }),
    ...(p.connectorId && { connectorId: p.connectorId }),
    ...(p.changeType && { changeType: p.changeType }),
  };
  const [items, total] = await Promise.all([
    prisma.frameworkUpdate.findMany({
      where, orderBy: { detectedAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize,
      include: { connector: { select: { id: true, name: true, sourceName: true, officialUrl: true } } },
    }),
    prisma.frameworkUpdate.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: p.page, pageSize: p.pageSize });
});
