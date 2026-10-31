import { z } from "zod";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";

export const FrameworkFilters = z.object({
  q: z.string().trim().max(200).optional().default(""),
  type: z.string().max(80).optional().default(""),
  jurisdiction: z.string().max(80).optional().default(""),
  group: z.string().max(80).optional().default(""),
});

/** Full repository list (27 rows — small enough to return in one response). */
export async function listFrameworks(f: z.infer<typeof FrameworkFilters>) {
  const rows = await prisma.framework.findMany({
    where: {
      ...(f.type && { type: f.type }),
      ...(f.jurisdiction && { jurisdiction: f.jurisdiction }),
      ...(f.group && { group: f.group }),
      ...(f.q && {
        OR: [
          { name: { contains: f.q, mode: "insensitive" } },
          { sourceId: { equals: f.q } },
          { description: { contains: f.q, mode: "insensitive" } },
          { family: { contains: f.q, mode: "insensitive" } },
        ],
      }),
    },
    include: { _count: { select: { citations: true } }, connectors: { select: { id: true, name: true, lastStatus: true, lastCheckedAt: true } } },
    orderBy: { name: "asc" },
  });
  const reqCounts = await prisma.$queryRaw<{ id: string; requirements: bigint; controls: bigint }[]>`
    SELECT c."frameworkId" AS id, COUNT(DISTINCT rc."requirementId") AS requirements,
      COUNT(DISTINCT m."controlId") AS controls
    FROM "Citation" c
    JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    LEFT JOIN "ControlRequirementMapping" m ON m."requirementId" = rc."requirementId" AND m.authoritative
    GROUP BY c."frameworkId"`;
  const byId = new Map(reqCounts.map((r) => [r.id, r]));
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    name: r.name,
    short: shortName(r.name),
    family: r.family,
    versionLabel: r.versionLabel,
    type: r.type,
    group: r.group,
    jurisdiction: r.jurisdiction,
    licensing: r.licensing,
    documentUrl: r.documentUrl,
    prioritizedByGsk: r.prioritizedByGsk,
    updatedAt: r.updatedAt,
    citations: r._count.citations,
    requirements: Number(byId.get(r.id)?.requirements ?? 0),
    controls: Number(byId.get(r.id)?.controls ?? 0),
    connector: r.connectors[0] ?? null,
  }));
}

export async function frameworkFacets() {
  const [types, jurisdictions, groups] = await Promise.all([
    prisma.framework.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.framework.groupBy({ by: ["jurisdiction"], _count: { _all: true } }),
    prisma.framework.groupBy({ by: ["group"], _count: { _all: true } }),
  ]);
  const f = (rows: { _count: { _all: number } }[], key: string) =>
    rows.map((r) => ({ value: (r as unknown as Record<string, string | null>)[key] ?? "", count: r._count._all })).filter((r) => r.value).sort((a, b) => a.value.localeCompare(b.value));
  return { types: f(types, "type"), jurisdictions: f(jurisdictions, "jurisdiction"), groups: f(groups, "group") };
}

export async function getFramework(id: string) {
  const fw = await prisma.framework.findFirst({
    where: { OR: [{ id }, { sourceId: id }] },
    include: { connectors: true, _count: { select: { citations: true } } },
  });
  if (!fw) return null;

  // Versions: other sources in the same derived family.
  const versions = fw.family
    ? await prisma.framework.findMany({ where: { family: fw.family }, select: { id: true, name: true, versionLabel: true, sourceId: true, _count: { select: { citations: true } } }, orderBy: { versionLabel: "asc" } })
    : [];

  // Top-level sections: first segment after the source prefix in "Source Section Name".
  const sections = await prisma.$queryRaw<{ section: string; citations: bigint }[]>`
    SELECT split_part(c."sectionName", ' - ', 2) AS section, COUNT(*) AS citations
    FROM "Citation" c WHERE c."frameworkId" = ${fw.id}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 40`;

  // Related frameworks: sources whose citations share integrated requirements with this one.
  const related = await prisma.$queryRaw<{ id: string; name: string; shared: bigint }[]>`
    WITH mine AS (
      SELECT DISTINCT rc."requirementId" FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id WHERE c."frameworkId" = ${fw.id}
    )
    SELECT f.id, f.name, COUNT(DISTINCT rc."requirementId") AS shared
    FROM "Citation" c
    JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    JOIN mine ON mine."requirementId" = rc."requirementId"
    JOIN "Framework" f ON f.id = c."frameworkId"
    WHERE c."frameworkId" <> ${fw.id}
    GROUP BY f.id ORDER BY shared DESC`;

  const totals = await prisma.$queryRaw<{ requirements: bigint; mapped: bigint; controls: bigint }[]>`
    SELECT COUNT(DISTINCT rc."requirementId") AS requirements,
      COUNT(DISTINCT rc."requirementId") FILTER (WHERE m.id IS NOT NULL) AS mapped,
      COUNT(DISTINCT m."controlId") AS controls
    FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    LEFT JOIN "ControlRequirementMapping" m ON m."requirementId" = rc."requirementId" AND m.authoritative
    WHERE c."frameworkId" = ${fw.id}`;

  return {
    ...fw,
    short: shortName(fw.name),
    versions: versions.map((v) => ({ ...v, short: shortName(v.name), citations: v._count.citations })),
    sections: sections.map((s) => ({ section: s.section || "(source root)", citations: Number(s.citations) })),
    related: related.map((r) => ({ id: r.id, name: r.name, short: shortName(r.name), shared: Number(r.shared) })),
    totals: { requirements: Number(totals[0]?.requirements ?? 0), mapped: Number(totals[0]?.mapped ?? 0), controls: Number(totals[0]?.controls ?? 0) },
  };
}

/** CCF controls linked (authoritatively) through any citation of the framework. */
export async function frameworkControls(frameworkId: string, p: { page: number; pageSize: number; q: string }) {
  const q = `%${p.q}%`;
  const rows = await prisma.$queryRaw<{ id: string; controlName: string; title: string | null; category: string | null; requirements: bigint; citations: bigint; total: bigint }[]>`
    SELECT k.id, k."controlName", k.title, k.category,
      COUNT(DISTINCT m."requirementId") AS requirements, COUNT(DISTINCT c.id) AS citations, COUNT(*) OVER() AS total
    FROM "Citation" c
    JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    JOIN "ControlRequirementMapping" m ON m."requirementId" = rc."requirementId" AND m.authoritative
    JOIN "CcfControl" k ON k.id = m."controlId"
    WHERE c."frameworkId" = ${frameworkId}
      AND (${p.q} = '' OR k."controlName" ILIKE ${q} OR k.title ILIKE ${q} OR k.category ILIKE ${q})
    GROUP BY k.id ORDER BY k."controlName"
    LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`;
  return {
    items: rows.map((r) => ({ id: r.id, controlName: r.controlName, title: r.title, category: r.category, requirements: Number(r.requirements), citations: Number(r.citations) })),
    total: Number(rows[0]?.total ?? 0),
    page: p.page,
    pageSize: p.pageSize,
  };
}
