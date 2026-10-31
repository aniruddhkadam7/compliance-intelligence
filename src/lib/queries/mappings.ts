// Cross-framework relationships. The workbook never states framework-to-framework
// equivalence; two sources are related only when their citations are linked to the
// same ArC Integrated Requirement. Everything here is derived from that join.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { ListParams } from "./params";

export async function sharedRequirementMatrix() {
  const frameworks = await prisma.framework.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const cells = await prisma.$queryRaw<{ a: string; b: string; shared: bigint }[]>`
    WITH fr AS (
      SELECT DISTINCT c."frameworkId" AS fid, rc."requirementId" AS rid
      FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    )
    SELECT x.fid AS a, y.fid AS b, COUNT(*) AS shared
    FROM fr x JOIN fr y ON x.rid = y.rid
    GROUP BY x.fid, y.fid`;
  return {
    frameworks: frameworks.map((f) => ({ id: f.id, name: f.name, short: shortName(f.name) })),
    cells: cells.map((c) => ({ a: c.a, b: c.b, shared: Number(c.shared) })),
  };
}

export const PairFilters = ListParams.extend({
  source: z.string().min(1).max(40),
  target: z.string().max(40).optional().default(""),
  status: z.enum(["all", "shared", "unmatched"]).optional().default("all"),
});
export type PairFilters = z.infer<typeof PairFilters>;

interface CitationRef {
  id: string;
  sid: string;
  name: string;
}

export async function mappingPairs(f: PairFilters) {
  const like = `%${f.q}%`;
  const rows = await prisma.$queryRaw<
    {
      rid: string; requirementId: string; name: string | null; riskTopic: string | null;
      source_citations: CitationRef[]; target_citations: CitationRef[] | null;
      controls: { id: string; name: string }[] | null; total: bigint;
    }[]
  >`
    WITH src AS (
      SELECT rc."requirementId" AS rid,
        json_agg(json_build_object('id', c.id, 'sid', c."sourceSectionId", 'name', c."sectionName") ORDER BY c."sectionName") AS cits
      FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id
      WHERE c."frameworkId" = ${f.source} GROUP BY rc."requirementId"
    ), tgt AS (
      SELECT rc."requirementId" AS rid,
        json_agg(json_build_object('id', c.id, 'sid', c."sourceSectionId", 'name', c."sectionName") ORDER BY c."sectionName") AS cits
      FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id
      WHERE c."frameworkId" = ${f.target} GROUP BY rc."requirementId"
    ), ctl AS (
      SELECT m."requirementId" AS rid, json_agg(DISTINCT jsonb_build_object('id', k.id, 'name', k."controlName")) AS controls
      FROM "ControlRequirementMapping" m JOIN "CcfControl" k ON k.id = m."controlId"
      WHERE m.authoritative AND m."requirementId" IS NOT NULL GROUP BY m."requirementId"
    )
    SELECT r.id AS rid, r."requirementId", r.name, r."riskTopic",
      src.cits AS source_citations, tgt.cits AS target_citations, ctl.controls, COUNT(*) OVER() AS total
    FROM src
    JOIN "IntegratedRequirement" r ON r.id = src.rid
    LEFT JOIN tgt ON tgt.rid = src.rid
    LEFT JOIN ctl ON ctl.rid = src.rid
    WHERE (${f.status} = 'all' OR (${f.status} = 'shared' AND tgt.rid IS NOT NULL) OR (${f.status} = 'unmatched' AND tgt.rid IS NULL))
      AND (${f.q} = '' OR r."requirementId" = ${f.q} OR r.name ILIKE ${like} OR r."riskTopic" ILIKE ${like}
           OR src.cits::text ILIKE ${like} OR COALESCE(tgt.cits::text, '') ILIKE ${like})
    ORDER BY (tgt.rid IS NULL), length(r."requirementId"), r."requirementId"
    LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`;

  const summary = await prisma.$queryRaw<{ source_reqs: bigint; target_reqs: bigint; shared: bigint; source_cits: bigint; mapped_shared: bigint }[]>`
    WITH s AS (SELECT DISTINCT rc."requirementId" AS rid FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id WHERE c."frameworkId" = ${f.source}),
         t AS (SELECT DISTINCT rc."requirementId" AS rid FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id WHERE c."frameworkId" = ${f.target})
    SELECT (SELECT COUNT(*) FROM s) AS source_reqs, (SELECT COUNT(*) FROM t) AS target_reqs,
      (SELECT COUNT(*) FROM s JOIN t USING (rid)) AS shared,
      (SELECT COUNT(*) FROM "Citation" WHERE "frameworkId" = ${f.source}) AS source_cits,
      (SELECT COUNT(*) FROM s JOIN t USING (rid) WHERE EXISTS (SELECT 1 FROM "ControlRequirementMapping" m WHERE m."requirementId" = s.rid AND m.authoritative)) AS mapped_shared`;
  const s = summary[0];

  return {
    items: rows.map((r) => ({
      id: r.rid, requirementId: r.requirementId, name: r.name, riskTopic: r.riskTopic,
      sourceCitations: r.source_citations ?? [], targetCitations: r.target_citations ?? [], controls: r.controls ?? [],
    })),
    total: Number(rows[0]?.total ?? 0),
    page: f.page,
    pageSize: f.pageSize,
    summary: {
      sourceRequirements: Number(s.source_reqs), targetRequirements: Number(s.target_reqs), shared: Number(s.shared),
      sourceCitations: Number(s.source_cits), mappedShared: Number(s.mapped_shared),
    },
  };
}

/** Graph for React Flow: frameworks → citations → IRs → CCF controls (bounded). */
export async function relationshipGraph(params: { source: string; target?: string; requirementId?: string; limit?: number }) {
  const limit = Math.min(params.limit ?? 12, 30);
  const reqs = await prisma.$queryRaw<{ rid: string }[]>`
    SELECT DISTINCT rc."requirementId" AS rid, length(r."requirementId") AS l, r."requirementId" AS n
    FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id
    JOIN "IntegratedRequirement" r ON r.id = rc."requirementId"
    WHERE c."frameworkId" = ${params.source}
      AND (${params.requirementId ?? ""} = '' OR r."requirementId" = ${params.requirementId ?? ""})
      AND (${params.target ?? ""} = '' OR EXISTS (
        SELECT 1 FROM "Citation" c2 JOIN "RequirementCitation" rc2 ON rc2."citationId" = c2.id
        WHERE c2."frameworkId" = ${params.target ?? ""} AND rc2."requirementId" = rc."requirementId"))
    ORDER BY l, n LIMIT ${limit}`;
  const ids = reqs.map((r) => r.rid);
  const fwIds = [params.source, ...(params.target ? [params.target] : [])];
  const data = await prisma.integratedRequirement.findMany({
    where: { id: { in: ids } },
    include: {
      citations: { where: { citation: { frameworkId: { in: fwIds } } }, include: { citation: { select: { id: true, sourceSectionId: true, sectionName: true, frameworkId: true } } } },
      mappings: { where: { authoritative: true }, include: { control: { select: { id: true, controlName: true, title: true } } } },
    },
    orderBy: { requirementId: "asc" },
  });
  const frameworks = await prisma.framework.findMany({ where: { id: { in: fwIds } }, select: { id: true, name: true } });
  return {
    frameworks: frameworks.map((f) => ({ id: f.id, short: shortName(f.name), name: f.name })),
    requirements: data.map((r) => ({
      id: r.id, requirementId: r.requirementId, name: r.name,
      citations: r.citations.map((x) => x.citation),
      controls: r.mappings.map((m) => ({ id: m.control.id, controlName: m.control.controlName, title: m.control.title, mappingType: m.mappingType })),
    })),
  };
}

/** Prioritised IRs with no authoritative primary CCF mapping, with review-sheet analyses. */
export async function unmappedRequirements(p: { page: number; pageSize: number; q: string }) {
  const where = {
    foundInPrioritized: true,
    mappings: { none: { authoritative: true, mappingType: "PRIMARY" as const } },
    ...(p.q && {
      OR: [
        { requirementId: p.q },
        { name: { contains: p.q, mode: "insensitive" as const } },
        { riskTopic: { contains: p.q, mode: "insensitive" as const } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.integratedRequirement.findMany({
      where,
      orderBy: { requirementId: "asc" },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      select: {
        id: true, requirementId: true, name: true, riskTopic: true,
        _count: { select: { citations: true } },
        mappings: { where: { authoritative: true, mappingType: "SECONDARY" }, select: { control: { select: { controlName: true } } } },
        reviews: { select: { sheetName: true, raw: true } },
      },
    }),
    prisma.integratedRequirement.count({ where }),
  ]);
  return {
    items: rows.map((r) => {
      // "Unmapped IRs (3)" is the latest consolidated analysis; fall back to any sheet.
      const latest = r.reviews.find((x) => x.sheetName === "Unmapped IRs (3)") ?? r.reviews[0];
      const raw = (latest?.raw ?? {}) as Record<string, string | null>;
      return {
        id: r.id, requirementId: r.requirementId, name: r.name, riskTopic: r.riskTopic, citations: r._count.citations,
        secondaryControls: r.mappings.map((m) => m.control.controlName),
        reviewSheets: r.reviews.map((x) => x.sheetName),
        latestSheet: latest?.sheetName ?? null,
        result: raw["Result"] ?? null,
        resultPtf: raw["Result(PTF)"] ?? null,
        resultNptf: raw["Result(NPTF)"] ?? null,
      };
    }),
    total, page: p.page, pageSize: p.pageSize,
  };
}
