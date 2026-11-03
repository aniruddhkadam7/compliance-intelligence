import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { ListParams, paging } from "./params";

export const CitationFilters = ListParams.extend({
  frameworkId: z.string().max(40).optional().default(""),
  family: z.string().max(80).optional().default(""),
  version: z.string().max(40).optional().default(""),
  field: z.enum(["all", "sectionId", "sectionName", "text"]).optional().default("all"),
  mapped: z.enum(["", "yes", "no"]).optional().default(""),
});
export type CitationFilters = z.infer<typeof CitationFilters>;

const SORTS: Record<string, Prisma.CitationOrderByWithRelationInput> = {
  sectionId: { sourceSectionId: "asc" },
  sectionName: { sectionName: "asc" },
  framework: { framework: { name: "asc" } },
};

export async function listCitations(f: CitationFilters) {
  const q = f.q;
  const textMatch: Prisma.CitationWhereInput[] = [];
  if (q) {
    if (f.field === "all" || f.field === "sectionId") textMatch.push({ sourceSectionId: { startsWith: q } });
    if (f.field === "all" || f.field === "sectionName") textMatch.push({ sectionName: { contains: q, mode: "insensitive" } });
    if (f.field === "text") textMatch.push({ sectionText: { contains: q, mode: "insensitive" } });
  }
  const where: Prisma.CitationWhereInput = {
    ...(f.frameworkId && { frameworkId: f.frameworkId }),
    ...((f.family || f.version) && { framework: { ...(f.family && { family: f.family }), ...(f.version && { versionLabel: f.version }) } }),
    ...(f.mapped === "yes" && { controls: { some: {} } }),
    ...(f.mapped === "no" && { controls: { none: {} } }),
    ...(textMatch.length && { OR: textMatch }),
  };
  const base = f.sort && SORTS[f.sort] ? SORTS[f.sort] : { sourceSectionId: "asc" as const };
  const orderBy = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, typeof v === "string" ? f.dir : { name: f.dir }]),
  ) as Prisma.CitationOrderByWithRelationInput;

  const [items, total] = await Promise.all([
    prisma.citation.findMany({
      where, orderBy, ...paging(f),
      select: {
        id: true, sourceSectionId: true, sectionName: true,
        framework: { select: { id: true, name: true, versionLabel: true, sourceId: true } },
        _count: { select: { controls: true } },
      },
    }),
    prisma.citation.count({ where }),
  ]);
  return {
    items: items.map((c) => ({
      id: c.id,
      sourceSectionId: c.sourceSectionId,
      sectionName: c.sectionName,
      sectionLabel: sectionLabel(c.sectionName),
      framework: { ...c.framework, short: shortName(c.framework.name) },
      controls: c._count.controls,
    })),
    total, page: f.page, pageSize: f.pageSize,
  };
}

/** Last segment of a hierarchical section name, e.g. "DE.CM-03". */
export function sectionLabel(name: string) {
  const parts = name.split(" - ");
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

const relatedSelect = { id: true, sourceSectionId: true, sectionName: true, framework: { select: { id: true, name: true } } } as const;

export async function getCitation(id: string) {
  const c = await prisma.citation.findFirst({
    where: { OR: [{ id }, { sourceSectionId: id }] },
    include: {
      framework: true,
      controls: {
        include: { control: { select: { id: true, controlName: true, title: true, category: true } } },
        orderBy: { control: { controlName: "asc" } },
      },
      procedures: { include: { testProcedure: { select: { procedureId: true, control: { select: { controlName: true } } } } } },
      relationsFrom: { select: { id: true, kind: true, status: true, note: true, toSourceId: true, toCitation: { select: relatedSelect } } },
      relationsTo: { select: { id: true, kind: true, status: true, note: true, fromSourceId: true, fromCitation: { select: relatedSelect } } },
    },
  });
  if (!c) return null;
  const { relationsFrom, relationsTo, ...rest } = c;
  // Supplied relationships only: version transitions and cross-framework links, in either direction.
  const related = [
    ...relationsFrom.map((r) => ({ id: r.id, kind: r.kind, status: r.status, note: r.note, direction: "to" as const, sourceId: r.toSourceId, citation: r.toCitation })),
    ...relationsTo.map((r) => ({ id: r.id, kind: r.kind, status: r.status, note: r.note, direction: "from" as const, sourceId: r.fromSourceId, citation: r.fromCitation })),
  ].map((r) => ({ ...r, citation: r.citation ? { ...r.citation, framework: { ...r.citation.framework, short: shortName(r.citation.framework.name) } } : null }));
  return {
    ...rest,
    related,
    sectionPath: c.sectionName.split(" - "),
    framework: { ...c.framework, short: shortName(c.framework.name) },
  };
}

export async function citationFacets() {
  const fws = await prisma.framework.findMany({ select: { id: true, name: true, family: true, versionLabel: true, _count: { select: { citations: true } } }, orderBy: { name: "asc" } });
  const families = new Map<string, { family: string; versions: { id: string; version: string | null }[] }>();
  for (const f of fws) {
    if (!f.family) continue;
    const e = families.get(f.family) ?? { family: f.family, versions: [] };
    e.versions.push({ id: f.id, version: f.versionLabel });
    families.set(f.family, e);
  }
  return {
    frameworks: fws.map((f) => ({ id: f.id, name: f.name, short: shortName(f.name), citations: f._count.citations, family: f.family, version: f.versionLabel })),
    families: [...families.values()].filter((f) => f.versions.length > 1),
  };
}
