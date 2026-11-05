import { z } from "zod";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { previousVersionOf, versionOf } from "@/lib/sources/previous-versions";
import { uninstalledVersions } from "@/lib/demo/state";

export const FrameworkFilters = z.object({
  q: z.string().trim().max(200).optional().default(""),
  type: z.string().max(80).optional().default(""),
  jurisdiction: z.string().max(80).optional().default(""),
  group: z.string().max(80).optional().default(""),
});

/**
 * Publication date reported by the official source in a connector's latest successful check:
 * catalogue/document "last modified", or the date of the latest consolidated legal text.
 */
function sourceDate(details: unknown): Date | null {
  const d = (details ?? {}) as { lastModified?: string; latestConsolidated?: { date?: string | null } | null };
  const raw = d.latestConsolidated?.date ?? d.lastModified ?? null;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Full repository list (small enough to return in one response). */
export async function listFrameworks(f: z.infer<typeof FrameworkFilters>) {
  // Framework versions whose update has not been applied in Sources are not in the repository yet.
  const notInstalled = await uninstalledVersions();
  const rows = await prisma.framework.findMany({
    where: {
      id: { notIn: notInstalled },
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
    include: {
      _count: { select: { citations: true } },
      connectors: { select: { name: true, checks: { where: { status: { not: "ERROR" } }, orderBy: { checkedAt: "desc" }, take: 10, select: { details: true } } } },
    },
    orderBy: { name: "asc" },
  });

  // Version lifecycle across the whole library (not only the filtered rows): newest version of a family is current.
  const all = await prisma.framework.findMany({ where: { id: { notIn: notInstalled } }, select: { id: true, family: true, versionLabel: true } });
  const newest = new Map<string, { id: string; version: string | null }>();
  for (const f of all) {
    if (!f.family) continue;
    const cur = newest.get(f.family);
    if (!cur || cmpVersion(f.versionLabel, cur.version) > 0) newest.set(f.family, { id: f.id, version: f.versionLabel });
  }

  const loaded = rows.map((r) => {
    const latest = r.family ? newest.get(r.family) : null;
    const reported = r.connectors
      // "Not modified" checks carry no details, so use the latest check that reported a date.
      .map((c) => ({ by: c.name, date: c.checks.map((k) => sourceDate(k.details)).find(Boolean) ?? null }))
      .filter((x): x is { by: string; date: Date } => !!x.date)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    return {
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
    citations: r._count.citations,
    sourceUpdatedAt: reported?.date ?? null,
    sourceUpdatedBy: reported?.by ?? null,
    loadedAt: r.updatedAt,
    versionStatus: (!latest || latest.id === r.id ? "CURRENT" : "PREVIOUS") as VersionStatus,
    supersededBy: latest && latest.id !== r.id ? { id: latest.id, version: latest.version } : null,
    note: null as string | null,
    };
  });

  // Earlier versions recorded from the publisher but not loaded (e.g. ISO/IEC 27002:2013): listed for reference,
  // without obligations. Shown only for the current version, and when that version is not itself in the library.
  const versionsHeld = new Set(all.map((f) => `${f.family}|${f.versionLabel}`));
  const recorded = rows.flatMap((r) => {
    const base = loaded.find((x) => x.id === r.id)!;
    const pv = previousVersionOf(r);
    if (base.versionStatus !== "CURRENT" || !pv?.version || versionsHeld.has(`${r.family}|${pv.version}`)) return [];
    return [{
      ...base, id: `recorded:${r.id}`, sourceId: "", name: `${shortName(r.name)}: version ${pv.version}`, versionLabel: pv.version,
      citations: 0, sourceUpdatedAt: null, sourceUpdatedBy: null, documentUrl: pv.source,
      versionStatus: "RECORDED" as VersionStatus, supersededBy: { id: r.id, version: versionOf(r) }, note: pv.note,
    }];
  });
  return [...loaded, ...recorded];
}

/** CURRENT: newest version in the library. PREVIOUS: an older loaded version. RECORDED: earlier version known from the publisher, not loaded. */
export type VersionStatus = "CURRENT" | "PREVIOUS" | "RECORDED";

const versionKey = (v: string | null) => (v ?? "").split(/[^\d]+/).filter(Boolean).map(Number);
function cmpVersion(a: string | null, b: string | null) {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
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

  const totals = await prisma.$queryRaw<{ mapped: bigint; controls: bigint }[]>`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE m.id IS NOT NULL) AS mapped,
      COUNT(DISTINCT m."controlId") AS controls
    FROM "Citation" c
    LEFT JOIN "ControlObligation" m ON m."citationId" = c.id
    WHERE c."frameworkId" = ${fw.id}`;

  return {
    ...fw,
    short: shortName(fw.name),
    versions: versions.map((v) => ({ ...v, short: shortName(v.name), citations: v._count.citations })),
    sections: sections.map((s) => ({ section: s.section || "(source root)", citations: Number(s.citations) })),
    totals: { mapped: Number(totals[0]?.mapped ?? 0), controls: Number(totals[0]?.controls ?? 0) },
  };
}

/** CCF controls linked (authoritatively) through any citation of the framework. */
export async function frameworkControls(frameworkId: string, p: { page: number; pageSize: number; q: string }) {
  const q = `%${p.q}%`;
  const rows = await prisma.$queryRaw<{ id: string; controlName: string; title: string | null; category: string | null; requirements: bigint; citations: bigint; total: bigint }[]>`
    SELECT k.id, k."controlName", k.title, k.category,
      0::bigint AS requirements, COUNT(DISTINCT c.id) AS citations, COUNT(*) OVER() AS total
    FROM "Citation" c
    JOIN "ControlObligation" m ON m."citationId" = c.id
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
