import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { controlsNeedingReview } from "@/lib/updates/impact";
import { controlVersions, type Highlight } from "@/lib/demo/state";
import { visibleControlFrameworks } from "./control-links";
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

/** A framework update applied in Sources as it affects one control: approval pending (yellow) or approved (green). */
export interface ControlUpdateFlag { key: string; family: string; previous: string; current: string; state: Highlight }

type Versions = Awaited<ReturnType<typeof controlVersions>>;

/** Applied updates whose mapping approval is open (controls uploaded before the update). */
const approvingUpdates = (v: Versions) => v.updates.filter((u) => u.status === "UPDATED" && !u.uploadedAfter);

function updateFlags(v: Versions, controlName: string): ControlUpdateFlag[] {
  return approvingUpdates(v).filter((u) => u.affected.has(controlName))
    .map((u) => ({ key: u.key, family: u.family, previous: u.previous, current: u.current, state: u.approved.has(controlName) ? "updated" : u.rejected.has(controlName) ? "rejected" : "pending" }));
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
    ],
  };
  const v = await controlVersions();
  if (f.frameworkId || f.family) {
    const links = await visibleControlFrameworks(v);
    const ids = new Set(links.filter((l) => (f.frameworkId ? l.frameworkId === f.frameworkId : (l.family ?? l.name) === f.family)).map((l) => l.controlId));
    // A framework's controls also include those its applied update affects. Until approved they have no link on the
    // version they point to, but they are flagged for review and must be found under that framework.
    if (!f.frameworkId) {
      const names = approvingUpdates(v).filter((u) => u.family === f.family).flatMap((u) => [...u.affected]);
      if (names.length) for (const c of await prisma.ccfControl.findMany({ where: { controlName: { in: names } }, select: { id: true } })) ids.add(c.id);
    }
    where.id = { in: [...ids] };
  }
  if (f.mapping === "conflict") where.id = { in: await conflictControlIds() };
  if (f.mapping === "review") where.id = { in: [...(await controlsNeedingReview()).keys()] };
  if (f.mapping === "update") where.controlName = { in: [...new Set(approvingUpdates(v).flatMap((u) => [...u.affected]))] };

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
  const review = await controlsNeedingReview(rows.map((r) => r.id));
  return { items: rows.map((r) => ({ ...r, review: review.get(r.id) ?? null, frameworkUpdates: updateFlags(v, r.controlName) })), total, page: f.page, pageSize: f.pageSize };
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
  const v = await controlVersions();
  const [cats, scopes, prefixes, links, names] = await Promise.all([
    prisma.ccfControl.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.ccfControl.groupBy({ by: ["scope"], _count: { _all: true } }),
    prisma.ccfControl.groupBy({ by: ["domainPrefix"], _count: { _all: true } }),
    visibleControlFrameworks(v),
    prisma.ccfControl.findMany({ select: { id: true, controlName: true } }),
  ]);
  // Per family: distinct controls across the versions they point to, plus each version's own count.
  const fams = new Map<string, { controls: Set<string>; versions: Map<string, { id: string; short: string; controls: Set<string> }> }>();
  for (const l of links) {
    const key = l.family ?? l.name;
    const fam = fams.get(key) ?? { controls: new Set(), versions: new Map() };
    fam.controls.add(l.controlId);
    const ver = fam.versions.get(l.frameworkId) ?? { id: l.frameworkId, short: shortName(l.name), controls: new Set<string>() };
    ver.controls.add(l.controlId);
    fam.versions.set(l.frameworkId, ver);
    fams.set(key, fam);
  }
  const present = new Set(names.map((n) => n.controlName));
  // Controls affected by an applied update count under that framework, as in the controls filter.
  const idByName = new Map(names.map((n) => [n.controlName, n.id]));
  for (const u of approvingUpdates(v)) {
    const fam = fams.get(u.family);
    if (fam) for (const n of u.affected) if (idByName.has(n)) fam.controls.add(idByName.get(n)!);
  }
  return {
    frameworks: [...fams].map(([family, x]) => ({
      family, controls: x.controls.size,
      versions: [...x.versions.values()].map((y) => ({ id: y.id, short: y.short, controls: y.controls.size })).sort((a, b) => a.short.localeCompare(b.short, undefined, { numeric: true })),
    })).sort((a, b) => a.family.localeCompare(b.family)),
    categories: cats.filter((c) => c.category).map((c) => ({ value: c.category!, count: c._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
    scopes: scopes.filter((c) => c.scope).map((c) => ({ value: c.scope!, count: c._count._all })).sort((a, b) => b.count - a.count),
    prefixes: prefixes.map((c) => ({ value: c.domainPrefix, count: c._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
    scope: await controlScope(),
    // Framework updates applied in Sources, with how many of the custom controls each affects and how many are approved.
    updates: v.updates.filter((u) => u.status === "UPDATED").map((u) => {
      const affected = [...u.affected].filter((n) => present.has(n));
      return {
        key: u.key, family: u.family, previous: u.previous, current: u.current, uploadedAfter: u.uploadedAfter,
        affected: affected.length, approved: u.uploadedAfter ? affected.length : affected.filter((n) => u.approved.has(n)).length,
        rejected: u.uploadedAfter ? 0 : affected.filter((n) => u.rejected.has(n)).length,
      };
    }),
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
  const v = await controlVersions();
  const { hidden, highlight } = v.resolve(c.controlName);
  c.obligations = c.obligations.filter((o) => !hidden.has(o.citation.framework.id));
  for (const t of c.testProcedures) t.obligations = t.obligations.filter((l) => !hidden.has(l.citation.frameworkId));

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
    /** Framework documents of an applied update: "pending" (awaiting approval), "rejected" (kept on the previous version) or "updated" (approved). */
    versionFlags: Object.fromEntries(highlight) as Record<string, Highlight>,
    frameworkUpdates: updateFlags(v, c.controlName),
  };
}

export type ControlDetail = NonNullable<Awaited<ReturnType<typeof getControl>>>;
