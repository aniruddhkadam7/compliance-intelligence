import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { searchParamsToObject } from "@/lib/queries/params";

const Params = z.object({
  view: z.enum(["jobs", "issues", "audit"]).optional().default("jobs"),
  jobId: z.string().max(40).optional(),
  severity: z.enum(["", "ERROR", "WARNING", "INFO"]).optional().default(""),
  code: z.string().max(40).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Import history, issues of a job (default: latest completed CCF import), audit log. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const p = Params.parse(searchParamsToObject(new URL(req.url).searchParams));
  const skip = (p.page - 1) * p.pageSize;

  if (p.view === "jobs") {
    const [items, total] = await Promise.all([
      prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, skip, take: p.pageSize, include: { _count: { select: { issues: true } } }, omit: { sheets: true } }),
      prisma.importJob.count(),
    ]);
    return NextResponse.json({ items, total, page: p.page, pageSize: p.pageSize });
  }

  if (p.view === "audit") {
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: p.pageSize }),
      prisma.auditLog.count(),
    ]);
    return NextResponse.json({ items, total, page: p.page, pageSize: p.pageSize });
  }

  const jobId = p.jobId ?? (await prisma.importJob.findFirst({ where: { kind: "CCF_WORKBOOK", status: "COMPLETED" }, orderBy: { completedAt: "desc" } }))?.id;
  if (!jobId) return NextResponse.json({ items: [], total: 0, page: 1, pageSize: p.pageSize, job: null, summary: [] });
  const where = { importJobId: jobId, ...(p.severity && { severity: p.severity }), ...(p.code && { code: p.code }) };
  const [items, total, job, summary] = await Promise.all([
    prisma.importIssue.findMany({ where, skip, take: p.pageSize, orderBy: [{ severity: "asc" }, { code: "asc" }, { row: "asc" }] }),
    prisma.importIssue.count({ where }),
    prisma.importJob.findUnique({ where: { id: jobId } }),
    prisma.importIssue.groupBy({ by: ["severity", "code"], where: { importJobId: jobId }, _count: { _all: true } }),
  ]);
  return NextResponse.json({ items, total, page: p.page, pageSize: p.pageSize, job, summary: summary.map((s) => ({ severity: s.severity, code: s.code, count: s._count._all })) });
});
