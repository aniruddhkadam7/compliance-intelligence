import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";

/**
 * Overview figures. Coverage is measured on regulatory obligations (source sections):
 * an obligation is "mapped" when at least one CCF control is linked to it.
 * The link comes from ControlObligation (test procedure mappings, or legacy mapping columns resolved at import).
 */
export async function getDashboard() {
  const [frameworks, obligations, controls, newUpdates, lastSync, lastImport] = await Promise.all([
    prisma.framework.count(),
    prisma.citation.count(),
    prisma.ccfControl.count(),
    prisma.frameworkUpdate.count({ where: { reviewStatus: "NEW" } }),
    prisma.connector.findFirst({ where: { lastSuccessAt: { not: null } }, orderBy: { lastSuccessAt: "desc" }, select: { lastSuccessAt: true, name: true } }),
    prisma.importJob.findFirst({ where: { status: "COMPLETED", kind: "CCF_WORKBOOK" }, orderBy: { completedAt: "desc" } }),
  ]);

  // Per framework: obligations, and obligations with at least one mapped CCF control.
  const perFramework = await prisma.$queryRaw<{ id: string; name: string; type: string | null; obligations: bigint; mapped: bigint }[]>`
    SELECT f.id, f.name, f.type,
      COUNT(c.id) AS obligations,
      COUNT(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM "ControlObligation" co WHERE co."citationId" = c.id)) AS mapped
    FROM "Framework" f
    LEFT JOIN "Citation" c ON c."frameworkId" = f.id
    GROUP BY f.id ORDER BY obligations DESC`;

  const mappedObligations = perFramework.reduce((n, f) => n + Number(f.mapped), 0);
  const controlsMapped = await prisma.ccfControl.count({ where: { obligations: { some: {} } } });

  const byType = await prisma.framework.groupBy({ by: ["type"], _count: { _all: true } });
  const byJurisdiction = await prisma.framework.groupBy({ by: ["jurisdiction"], _count: { _all: true } });

  const [recentUpdates, recentActivity, issueGroups] = await Promise.all([
    prisma.frameworkUpdate.findMany({ orderBy: { detectedAt: "desc" }, take: 5, include: { connector: { select: { name: true } } } }),
    prisma.auditLog.findMany({
      where: { action: { in: ["IMPORT_COMPLETED", "IMPORT_REJECTED", "UPDATE_REVIEWED", "CONNECTOR_SYNC", "DATA_RESET"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    lastImport
      ? prisma.importIssue.groupBy({ by: ["code", "severity"], where: { importJobId: lastImport.id }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);

  return {
    totals: {
      frameworks, obligations, controls, controlsMapped, newUpdates,
      mappedObligations,
      unmappedObligations: obligations - mappedObligations,
    },
    lastSync: lastSync?.lastSuccessAt ?? null,
    lastSyncConnector: lastSync?.name ?? null,
    lastImport: lastImport ? { id: lastImport.id, fileName: lastImport.fileName, completedAt: lastImport.completedAt } : null,
    perFramework: perFramework.map((f) => ({
      id: f.id,
      name: f.name,
      short: shortName(f.name),
      type: f.type,
      obligations: Number(f.obligations),
      mapped: Number(f.mapped),
    })),
    byType: byType.map((t) => ({ label: t.type ?? "Unspecified", count: t._count._all })).sort((a, b) => b.count - a.count),
    byJurisdiction: byJurisdiction.map((t) => ({ label: t.jurisdiction ?? "Unspecified", count: t._count._all })).sort((a, b) => b.count - a.count),
    recentUpdates,
    recentActivity,
    dataQuality: issueGroups
      .map((g) => ({ code: g.code, severity: g.severity, count: g._count._all }))
      .sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "ERROR" ? -1 : a.severity === "WARNING" && b.severity === "INFO" ? -1 : 1)),
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
