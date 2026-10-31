import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { ListParams, paging } from "./params";

export const ControlFilters = ListParams.extend({
  category: z.string().max(120).optional().default(""),
  scope: z.string().max(60).optional().default(""),
  prefix: z.string().max(30).optional().default(""),
  mapping: z.enum(["", "mapped", "secondary", "unresolved", "conflict"]).optional().default(""),
  frameworkId: z.string().max(40).optional().default(""),
});
export type ControlFilters = z.infer<typeof ControlFilters>;

const SORTS = ["controlName", "category", "scope", "title"] as const;

/** Control names whose working-sheet primary mapping differs from the authoritative one. */
async function conflictControlIds() {
  const rows = await prisma.$queryRaw<{ controlId: string }[]>`
    SELECT a."controlId" FROM "ControlRequirementMapping" a
    JOIN "ControlRequirementMapping" w ON w."controlId" = a."controlId" AND w."mappingType" = 'PRIMARY' AND NOT w.authoritative
    WHERE a."mappingType" = 'PRIMARY' AND a.authoritative AND a."rawValue" <> w."rawValue"`;
  return rows.map((r) => r.controlId);
}

export async function listControls(f: ControlFilters) {
  const where: Prisma.CcfControlWhereInput = {
    ...(f.category && { category: f.category }),
    ...(f.scope && { scope: f.scope }),
    ...(f.prefix && { domainPrefix: f.prefix }),
    ...(f.q && {
      OR: [
        { controlName: { contains: f.q, mode: "insensitive" } },
        { title: { contains: f.q, mode: "insensitive" } },
        { objective: { contains: f.q, mode: "insensitive" } },
        { activityStatementV2: { contains: f.q, mode: "insensitive" } },
        { mappings: { some: { authoritative: true, rawValue: f.q } } },
      ],
    }),
    AND: [
      f.mapping === "mapped" ? { mappings: { some: { authoritative: true, requirementId: { not: null } } } } : {},
      f.mapping === "secondary" ? { mappings: { some: { authoritative: true, mappingType: "SECONDARY" } } } : {},
      f.mapping === "unresolved" ? { mappings: { some: { authoritative: true, requirementId: null } } } : {},
      f.frameworkId
        ? { mappings: { some: { authoritative: true, requirement: { citations: { some: { citation: { frameworkId: f.frameworkId } } } } } } }
        : {},
    ],
  };
  if (f.mapping === "conflict") where.id = { in: await conflictControlIds() };

  const sortKey = (SORTS as readonly string[]).includes(f.sort ?? "") ? f.sort! : "controlName";
  const [rows, total] = await Promise.all([
    prisma.ccfControl.findMany({
      where, ...paging(f), orderBy: { [sortKey]: f.dir },
      select: {
        id: true, controlName: true, title: true, category: true, subCategory: true, scope: true, technicalType: true, productTeamFacing: true,
        mappings: { where: { authoritative: true }, select: { mappingType: true, rawValue: true, requirementId: true, requirement: { select: { requirementId: true, name: true, _count: { select: { citations: true } } } } } },
        _count: { select: { testProcedures: true, evidence: true, frameworkReferences: true } },
      },
    }),
    prisma.ccfControl.count({ where }),
  ]);
  return { items: rows, total, page: f.page, pageSize: f.pageSize };
}

export async function controlFacets() {
  const [cats, scopes, prefixes] = await Promise.all([
    prisma.ccfControl.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.ccfControl.groupBy({ by: ["scope"], _count: { _all: true } }),
    prisma.ccfControl.groupBy({ by: ["domainPrefix"], _count: { _all: true } }),
  ]);
  return {
    categories: cats.filter((c) => c.category).map((c) => ({ value: c.category!, count: c._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
    scopes: scopes.filter((c) => c.scope).map((c) => ({ value: c.scope!, count: c._count._all })).sort((a, b) => b.count - a.count),
    prefixes: prefixes.map((c) => ({ value: c.domainPrefix, count: c._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
  };
}

export async function getControl(idOrName: string) {
  const c = await prisma.ccfControl.findFirst({
    where: { OR: [{ id: idOrName }, { controlName: idOrName }] },
    include: {
      mappings: {
        include: {
          requirement: {
            include: {
              citations: { include: { citation: { include: { framework: { select: { id: true, name: true, sourceId: true, versionLabel: true, family: true } } } } } },
            },
          },
        },
        orderBy: [{ authoritative: "desc" }, { mappingType: "asc" }],
      },
      testProcedures: true,
      evidence: true,
      frameworkReferences: { orderBy: { columnName: "asc" } },
    },
  });
  if (!c) return null;

  const authoritative = c.mappings.filter((m) => m.authoritative);
  const working = c.mappings.filter((m) => !m.authoritative);
  const primaryA = authoritative.find((m) => m.mappingType === "PRIMARY");
  const primaryW = working.find((m) => m.mappingType === "PRIMARY");
  const conflict = primaryA && primaryW && primaryA.rawValue !== primaryW.rawValue ? { authoritative: primaryA.rawValue, working: primaryW.rawValue } : null;

  // Traceability: control → IR → citation → framework (authoritative mappings only)
  type Cit = { id: string; sourceSectionId: string; sectionName: string; requirementId: string; mappingType: string };
  const frameworks = new Map<string, { id: string; name: string; short: string; sourceId: string; citations: Cit[] }>();
  for (const m of authoritative) {
    if (!m.requirement) continue;
    for (const { citation } of m.requirement.citations) {
      const fw = citation.framework;
      const e = frameworks.get(fw.id) ?? { id: fw.id, name: fw.name, short: shortName(fw.name), sourceId: fw.sourceId, citations: [] };
      e.citations.push({ id: citation.id, sourceSectionId: citation.sourceSectionId, sectionName: citation.sectionName, requirementId: m.requirement.requirementId, mappingType: m.mappingType });
      frameworks.set(fw.id, e);
    }
  }
  const trace = [...frameworks.values()].sort((a, b) => b.citations.length - a.citations.length);

  // Light shape for the client (drop nested citation arrays from mappings).
  const mappings = c.mappings.map((m) => ({
    id: m.id, mappingType: m.mappingType, rawValue: m.rawValue, authoritative: m.authoritative, sourceSheet: m.sourceSheet, sourceColumn: m.sourceColumn,
    requirement: m.requirement
      ? { id: m.requirement.id, requirementId: m.requirement.requirementId, name: m.requirement.name, riskTopic: m.requirement.riskTopic, riskStatement: m.requirement.riskStatement, citationCount: m.requirement.citations.length }
      : null,
  }));
  const { mappings: _omit, ...rest } = c;
  void _omit;
  return { ...rest, mappings, conflict, trace, citationTotal: trace.reduce((n, f) => n + f.citations.length, 0) };
}

export type ControlDetail = NonNullable<Awaited<ReturnType<typeof getControl>>>;
