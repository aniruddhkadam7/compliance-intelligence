import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";

export async function getDashboard() {
  const [frameworks, citations, controls, requirements, prioritized, newUpdates, lastSync, lastImport] = await Promise.all([
    prisma.framework.count(),
    prisma.citation.count(),
    prisma.ccfControl.count(),
    prisma.integratedRequirement.count(),
    prisma.integratedRequirement.count({ where: { foundInPrioritized: true } }),
    prisma.frameworkUpdate.count({ where: { reviewStatus: "NEW" } }),
    prisma.connector.findFirst({ where: { lastSuccessAt: { not: null } }, orderBy: { lastSuccessAt: "desc" }, select: { lastSuccessAt: true, name: true } }),
    prisma.importJob.findFirst({ where: { status: "COMPLETED", kind: "CCF_WORKBOOK" }, orderBy: { completedAt: "desc" } }),
  ]);

  // Coverage follows the workbook's own definition ("Count in CCF v2 Mapping?"): authoritative
  // PRIMARY mappings. IRs reached only through a secondary mapping are reported separately.
  const coverageRows = await prisma.$queryRaw<{ prioritized: boolean | null; mapped: bigint; secondary_only: bigint }[]>`
    SELECT r."foundInPrioritized" AS prioritized,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "ControlRequirementMapping" m
        WHERE m."requirementId" = r.id AND m.authoritative AND m."mappingType" = 'PRIMARY')) AS mapped,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "ControlRequirementMapping" m
        WHERE m."requirementId" = r.id AND m.authoritative AND m."mappingType" = 'PRIMARY')
        AND EXISTS (SELECT 1 FROM "ControlRequirementMapping" m
        WHERE m."requirementId" = r.id AND m.authoritative AND m."mappingType" = 'SECONDARY')) AS secondary_only
    FROM "IntegratedRequirement" r GROUP BY r."foundInPrioritized"`;
  const pr = coverageRows.find((r) => r.prioritized === true);
  const mappedPrioritized = Number(pr?.mapped ?? 0);
  const secondaryOnlyPrioritized = Number(pr?.secondary_only ?? 0);

  const controlsMapped = await prisma.ccfControl.count({ where: { mappings: { some: { authoritative: true, requirementId: { not: null } } } } });

  // Per-framework citation volume and requirement coverage.
  const perFramework = await prisma.$queryRaw<
    { id: string; name: string; type: string | null; citations: bigint; requirements: bigint; mapped_requirements: bigint }[]
  >`
    SELECT f.id, f.name, f.type,
      (SELECT COUNT(*) FROM "Citation" c WHERE c."frameworkId" = f.id) AS citations,
      COUNT(DISTINCT rc."requirementId") AS requirements,
      COUNT(DISTINCT rc."requirementId") FILTER (WHERE EXISTS (
        SELECT 1 FROM "ControlRequirementMapping" m
        WHERE m."requirementId" = rc."requirementId" AND m.authoritative AND m."mappingType" = 'PRIMARY')) AS mapped_requirements
    FROM "Framework" f
    LEFT JOIN "Citation" c ON c."frameworkId" = f.id
    LEFT JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    GROUP BY f.id ORDER BY citations DESC`;

  const byType = await prisma.framework.groupBy({ by: ["type"], _count: { _all: true } });
  const byJurisdiction = await prisma.framework.groupBy({ by: ["jurisdiction"], _count: { _all: true } });

  const [recentUpdates, recentActivity, issueGroups] = await Promise.all([
    prisma.frameworkUpdate.findMany({ orderBy: { detectedAt: "desc" }, take: 5, include: { connector: { select: { name: true } } } }),
    prisma.auditLog.findMany({
      where: { action: { in: ["IMPORT_COMPLETED", "IMPORT_REJECTED", "TRANSITION_IMPORTED", "UPDATE_REVIEWED", "CONNECTOR_SYNC", "DATA_RESET"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    lastImport
      ? prisma.importIssue.groupBy({ by: ["code", "severity"], where: { importJobId: lastImport.id }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);

  return {
    totals: {
      frameworks, citations, controls, requirements, prioritized,
      mappedPrioritized,
      secondaryOnlyPrioritized,
      unmappedPrioritized: prioritized - mappedPrioritized,
      notInPrioritized: requirements - prioritized,
      controlsMapped,
      newUpdates,
    },
    lastSync: lastSync?.lastSuccessAt ?? null,
    lastSyncConnector: lastSync?.name ?? null,
    lastImport: lastImport ? { id: lastImport.id, fileName: lastImport.fileName, completedAt: lastImport.completedAt } : null,
    perFramework: perFramework.map((f) => ({
      id: f.id,
      name: f.name,
      short: shortName(f.name),
      type: f.type,
      citations: Number(f.citations),
      requirements: Number(f.requirements),
      mappedRequirements: Number(f.mapped_requirements),
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
