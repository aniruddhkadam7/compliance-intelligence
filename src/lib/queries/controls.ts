import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { controlsNeedingReview } from "@/lib/updates/impact";
import { ListParams, paging } from "./params";

export const ControlFilters = ListParams.extend({
  category: z.string().max(120).optional().default(""),
  scope: z.string().max(60).optional().default(""),
  prefix: z.string().max(30).optional().default(""),
  mapping: z.enum(["", "mapped", "unmapped", "conflict", "review"]).optional().default(""),
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
      ],
    }),
    AND: [
      f.mapping === "mapped" ? { obligations: { some: {} } } : {},
      f.mapping === "unmapped" ? { obligations: { none: {} } } : {},
      f.frameworkId ? { obligations: { some: { citation: { frameworkId: f.frameworkId } } } } : {},
    ],
  };
  if (f.mapping === "conflict") where.id = { in: await conflictControlIds() };
  if (f.mapping === "review") where.id = { in: [...(await controlsNeedingReview()).keys()] };

  const sortKey = (SORTS as readonly string[]).includes(f.sort ?? "") ? f.sort! : "controlName";
  const [rows, total] = await Promise.all([
    prisma.ccfControl.findMany({
      where, ...paging(f), orderBy: { [sortKey]: f.dir },
      select: {
        id: true, controlName: true, title: true, category: true, subCategory: true, scope: true, technicalType: true, productTeamFacing: true,
        _count: { select: { testProcedures: true, evidence: true, frameworkReferences: true, obligations: true } },
      },
    }),
    prisma.ccfControl.count({ where }),
  ]);
  // Controls whose framework mapping is affected by a new version and awaits review.
  const review = await controlsNeedingReview(rows.map((r) => r.id));
  return { items: rows.map((r) => ({ ...r, review: review.get(r.id) ?? null })), total, page: f.page, pageSize: f.pageSize };
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
      // Legacy mapping columns are only read to flag disagreement between workbook sheets.
      mappings: { where: { mappingType: "PRIMARY" }, select: { rawValue: true, authoritative: true } },
      obligations: {
        include: { citation: { select: { id: true, sourceSectionId: true, sectionName: true, framework: { select: { id: true, name: true, sourceId: true } } } } },
      },
      testProcedures: {
        include: { obligations: { include: { citation: { select: { id: true, sourceSectionId: true, sectionName: true, frameworkId: true } } } } },
        orderBy: [{ procedureId: "asc" }, { kind: "asc" }],
      },
      evidence: true,
      frameworkReferences: { orderBy: { columnName: "asc" } },
    },
  });
  if (!c) return null;

  const primaryA = c.mappings.find((m) => m.authoritative);
  const primaryW = c.mappings.find((m) => !m.authoritative);
  const conflict = primaryA && primaryW && primaryA.rawValue !== primaryW.rawValue ? { authoritative: primaryA.rawValue, working: primaryW.rawValue } : null;

  // Traceability: framework → obligation → control.
  type Obl = { id: string; sourceSectionId: string; sectionName: string; mappingType: string };
  const frameworks = new Map<string, { id: string; name: string; short: string; sourceId: string; citations: Obl[] }>();
  for (const o of c.obligations) {
    const fw = o.citation.framework;
    const e = frameworks.get(fw.id) ?? { id: fw.id, name: fw.name, short: shortName(fw.name), sourceId: fw.sourceId, citations: [] };
    e.citations.push({ id: o.citation.id, sourceSectionId: o.citation.sourceSectionId, sectionName: o.citation.sectionName, mappingType: o.mappingType });
    frameworks.set(fw.id, e);
  }
  const trace = [...frameworks.values()].sort((a, b) => b.citations.length - a.citations.length);
  trace.forEach((f) => f.citations.sort((a, b) => a.sourceSectionId.localeCompare(b.sourceSectionId, undefined, { numeric: true })));

  const review = (await controlsNeedingReview([c.id])).get(c.id) ?? null;
  const { mappings: _m, obligations: _o, ...rest } = c;
  void _m;
  void _o;
  return {
    ...rest,
    testProcedures: c.testProcedures.map((t) => ({ ...t, obligations: t.obligations.map((l) => l.citation) })),
    conflict,
    review,
    trace,
    citationTotal: c.obligations.length,
  };
}

export type ControlDetail = NonNullable<Awaited<ReturnType<typeof getControl>>>;
