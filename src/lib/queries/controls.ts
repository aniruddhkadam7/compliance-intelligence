import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { controlsNeedingReview } from "@/lib/updates/impact";
import { frameworkUpdates, type FrameworkUpdate, type FrameworkUpdateKind } from "./sources";
const KIND_ORDER: FrameworkUpdateKind[] = ["READY", "AVAILABLE", "NEWER_IN_LIBRARY"];
import { ListParams, paging } from "./params";

export const ControlFilters = ListParams.extend({
  category: z.string().max(120).optional().default(""),
  scope: z.string().max(60).optional().default(""),
  prefix: z.string().max(30).optional().default(""),
  mapping: z.enum(["", "mapped", "unmapped", "conflict", "review", "update"]).optional().default(""),
  frameworkId: z.string().max(40).optional().default(""),
  /** Framework family (all versions), e.g. "NIST CSF". */
  family: z.string().max(120).optional().default(""),
  /** Client scope: in scope, out of scope, or the workbook's client selection ("CCFv2"). */
  inScope: z.enum(["", "in", "out", "selection"]).optional().default(""),
});
export type ControlFilters = z.infer<typeof ControlFilters>;

/** ControlObligation.mappingType of illustrative demonstration links (see scripts/seed-nist-demo.ts). */
export const DEMO_MAPPING = "DEMO";

/** Per control: mapped documents that have a newer version (released for install, or at the publisher). */
async function controlFrameworkUpdates(controlIds?: string[]) {
  const updates = await frameworkUpdates();
  const out = new Map<string, FrameworkUpdate[]>();
  if (!updates.size) return { updates, byControl: out };
  const links = await prisma.controlObligation.findMany({
    where: { citation: { frameworkId: { in: [...updates.keys()] } }, control: { inScope: true }, ...(controlIds && { controlId: { in: controlIds } }) },
    distinct: ["controlId", "citationId"], select: { controlId: true, citation: { select: { frameworkId: true } } },
  });
  for (const l of links) {
    const list = out.get(l.controlId) ?? [];
    if (!list.some((u) => u.frameworkId === l.citation.frameworkId)) list.push(updates.get(l.citation.frameworkId)!);
    out.set(l.controlId, list);
  }
  return { updates, byControl: out };
}

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
    ...(f.inScope === "in" && { inScope: true }),
    ...(f.inScope === "out" && { inScope: false }),
    ...(f.inScope === "selection" && { inClientSelection: true }),
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
      f.family && !f.frameworkId ? { obligations: { some: { citation: { framework: { family: f.family } } } } } : {},
    ],
  };
  if (f.mapping === "conflict") where.id = { in: await conflictControlIds() };
  if (f.mapping === "review") where.id = { in: [...(await controlsNeedingReview()).keys()] };
  if (f.mapping === "update") where.id = { in: [...(await controlFrameworkUpdates()).byControl.keys()] };

  const sortKey = (SORTS as readonly string[]).includes(f.sort ?? "") ? f.sort! : "controlName";
  const [rows, total] = await Promise.all([
    prisma.ccfControl.findMany({
      where, ...paging(f), orderBy: { [sortKey]: f.dir },
      select: {
        id: true, controlName: true, title: true, category: true, subCategory: true, scope: true, technicalType: true, productTeamFacing: true,
        inScope: true, inClientSelection: true,
        _count: { select: { testProcedures: true, evidence: true, frameworkReferences: true, obligations: true } },
      },
    }),
    prisma.ccfControl.count({ where }),
  ]);
  // Controls whose framework mapping is affected by a new version and awaits review.
  const [review, { byControl }] = await Promise.all([controlsNeedingReview(rows.map((r) => r.id)), controlFrameworkUpdates(rows.map((r) => r.id))]);
  return { items: rows.map((r) => ({ ...r, review: review.get(r.id) ?? null, frameworkUpdates: byControl.get(r.id) ?? [] })), total, page: f.page, pageSize: f.pageSize };
}

/** The client's scope: how many controls are in it, and how many the workbook lists as the client's selection. */
export async function controlScope() {
  const [total, inScope, selection, selectionInScope] = await Promise.all([
    prisma.ccfControl.count(),
    prisma.ccfControl.count({ where: { inScope: true } }),
    prisma.ccfControl.count({ where: { inClientSelection: true } }),
    prisma.ccfControl.count({ where: { inClientSelection: true, inScope: true } }),
  ]);
  return { total, inScope, selection, selectionInScope };
}

/** Sets the client's scope: listed controls, every control, or only the workbook's client selection. */
export async function setControlScope(change: { ids: string[]; inScope: boolean } | { preset: "all" | "selection" }) {
  if ("preset" in change) {
    if (change.preset === "all") return (await prisma.ccfControl.updateMany({ data: { inScope: true } })).count;
    const [a, b] = await prisma.$transaction([
      prisma.ccfControl.updateMany({ where: { inClientSelection: true }, data: { inScope: true } }),
      prisma.ccfControl.updateMany({ where: { inClientSelection: false }, data: { inScope: false } }),
    ]);
    return a.count + b.count;
  }
  return (await prisma.ccfControl.updateMany({ where: { id: { in: change.ids } }, data: { inScope: change.inScope } })).count;
}

export async function controlFacets() {
  const [cats, scopes, prefixes, fwRows] = await Promise.all([
    prisma.ccfControl.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.ccfControl.groupBy({ by: ["scope"], _count: { _all: true } }),
    prisma.ccfControl.groupBy({ by: ["domainPrefix"], _count: { _all: true } }),
    // Distinct controls mapped to each framework version (any mapping type).
    prisma.$queryRaw<{ id: string; name: string; family: string | null; controls: bigint }[]>`
      SELECT f."id", f."name", f."family", COUNT(DISTINCT o."controlId") AS controls
      FROM "Framework" f
      JOIN "Citation" c ON c."frameworkId" = f."id"
      JOIN "ControlObligation" o ON o."citationId" = c."id"
      GROUP BY f."id", f."name", f."family"`,
  ]);
  // Per family: distinct controls across all its versions, plus each version's own count.
  const famIds = new Map<string, string[]>();
  for (const r of fwRows) famIds.set(r.family ?? r.name, [...(famIds.get(r.family ?? r.name) ?? []), r.id]);
  const famCounts = await Promise.all([...famIds.entries()].map(async ([family, ids]) => ({
    family,
    controls: await prisma.ccfControl.count({ where: { obligations: { some: { citation: { frameworkId: { in: ids } } } } } }),
    versions: fwRows.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, short: shortName(r.name), controls: Number(r.controls) }))
      .sort((a, b) => a.short.localeCompare(b.short, undefined, { numeric: true })),
  })));
  return {
    frameworks: famCounts.sort((a, b) => a.family.localeCompare(b.family)),
    categories: cats.filter((c) => c.category).map((c) => ({ value: c.category!, count: c._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
    scopes: scopes.filter((c) => c.scope).map((c) => ({ value: c.scope!, count: c._count._all })).sort((a, b) => b.count - a.count),
    prefixes: prefixes.map((c) => ({ value: c.domainPrefix, count: c._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
    scope: await controlScope(),
    // Mapped documents with a newer version, and how many in-scope controls each affects.
    updates: await (async () => {
      const { updates, byControl } = await controlFrameworkUpdates();
      return [...updates.values()]
        .map((u) => ({ ...u, controls: [...byControl.values()].filter((l) => l.some((x) => x.frameworkId === u.frameworkId)).length }))
        .filter((u) => u.controls > 0).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.controls - a.controls);
    })(),
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
        include: { obligations: { include: { citation: { select: { id: true, sourceSectionId: true, sectionName: true, frameworkId: true, framework: { select: { id: true, name: true, sourceId: true } } } } } } },
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

  // Per test procedure: each framework kept separate with its own obligations. Links the control marks DEMO are
  // illustrative demonstration data awaiting validation.
  const demo = new Set(c.obligations.filter((o) => o.mappingType === DEMO_MAPPING).map((o) => o.citation.id));
  const group = (rows: { id: string; sourceSectionId: string; sectionName: string; frameworkId: string }[], fwById: Map<string, { id: string; name: string; sourceId: string }>) => {
    const byFw = new Map<string, { id: string; name: string; short: string; sourceId: string; obligations: (Obl & { demo: boolean })[] }>();
    for (const r of rows) {
      const fw = fwById.get(r.frameworkId);
      if (!fw) continue;
      const e = byFw.get(fw.id) ?? { id: fw.id, name: fw.name, short: shortName(fw.name), sourceId: fw.sourceId, obligations: [] };
      if (!e.obligations.some((x) => x.id === r.id)) e.obligations.push({ id: r.id, sourceSectionId: r.sourceSectionId, sectionName: r.sectionName, mappingType: demo.has(r.id) ? DEMO_MAPPING : "PROCEDURE", demo: demo.has(r.id) });
      byFw.set(fw.id, e);
    }
    const out = [...byFw.values()];
    out.forEach((f) => f.obligations.sort((a, b) => a.sourceSectionId.localeCompare(b.sourceSectionId, undefined, { numeric: true })));
    return out.sort((a, b) => a.short.localeCompare(b.short, undefined, { numeric: true }));
  };
  const fwById = new Map([
    ...c.obligations.map((o) => o.citation.framework),
    ...c.testProcedures.flatMap((t) => t.obligations.map((l) => l.citation.framework)),
  ].map((f) => [f.id, f]));
  const frameworkIdOf = new Map(c.obligations.map((o) => [o.citation.id, o.citation.framework.id]));
  const procedureTrace = c.testProcedures
    .filter((t) => t.kind === "PROCEDURE")
    .map((t) => ({
      id: t.id, procedureId: t.procedureId, text: t.text,
      frameworks: group(t.obligations.map((l) => ({ ...l.citation, frameworkId: l.citation.frameworkId })), fwById),
    }));
  // Obligations linked to the control but to no test procedure (legacy primary/secondary mappings).
  const viaProcedure = new Set(c.testProcedures.flatMap((t) => t.obligations.map((l) => l.citation.id)));
  const controlLevel = group(
    c.obligations.filter((o) => !viaProcedure.has(o.citation.id)).map((o) => ({ ...o.citation, frameworkId: frameworkIdOf.get(o.citation.id)! })),
    fwById,
  );

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
    procedureTrace,
    controlLevel,
    citationTotal: c.obligations.length,
  };
}

export type ControlDetail = NonNullable<Awaited<ReturnType<typeof getControl>>>;
