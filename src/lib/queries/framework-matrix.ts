// Framework Matrix: framework-to-framework relationships.
//
// Basis "controls" reuses the existing mapping engine: two sections of different documents are related
// when the same internal control maps to both (ControlObligation). The controls themselves are never
// returned, only counts and the owning team scope, so no control IDs or control-framework terminology
// reach the screen. Basis "supplied" uses relationship files imported as CROSS_FRAMEWORK. Nothing is inferred.
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { parseHeading } from "@/lib/sources/headings";

export const MATRIX_BASES = ["controls", "supplied"] as const;
export type MatrixBasis = (typeof MATRIX_BASES)[number];

interface LinkRow { a_id: string; a_sid: string; a_name: string; a_text: string | null; b_id: string; b_sid: string; b_name: string; b_text: string | null; bridge: string | null; team: string | null; rel: string | null }

async function names(ids: string[]) {
  const fws = await prisma.framework.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, type: true } });
  return new Map(fws.map((f) => [f.id, { id: f.id, short: shortName(f.name), type: f.type }]));
}

/** Document pairs with at least one link on the chosen basis (unordered). */
export async function matrixPairs(basis: MatrixBasis) {
  const rows = basis === "controls"
    ? await prisma.$queryRaw<{ a: string; b: string; links: bigint; bridges: bigint }[]>`
        SELECT ca."frameworkId" AS a, cb."frameworkId" AS b,
               COUNT(DISTINCT ca.id || '|' || cb.id) AS links, COUNT(DISTINCT x."controlId") AS bridges
        FROM "ControlObligation" x
        JOIN "ControlObligation" y ON y."controlId" = x."controlId"
        JOIN "Citation" ca ON ca.id = x."citationId"
        JOIN "Citation" cb ON cb.id = y."citationId"
        WHERE ca."frameworkId" < cb."frameworkId"
        GROUP BY 1, 2`
    : await prisma.$queryRaw<{ a: string; b: string; links: bigint; bridges: bigint }[]>`
        SELECT LEAST(ca."frameworkId", cb."frameworkId") AS a, GREATEST(ca."frameworkId", cb."frameworkId") AS b,
               COUNT(DISTINCT LEAST(ca.id, cb.id) || '|' || GREATEST(ca.id, cb.id)) AS links, 0::bigint AS bridges
        FROM "SourceRelationship" r
        JOIN "Citation" ca ON ca.id = r."fromCitationId"
        JOIN "Citation" cb ON cb.id = r."toCitationId"
        WHERE r.kind = 'CROSS_FRAMEWORK' AND ca."frameworkId" <> cb."frameworkId"
        GROUP BY 1, 2`;
  const nm = await names(rows.flatMap((r) => [r.a, r.b]));
  return rows.map((r) => ({ a: nm.get(r.a)!, b: nm.get(r.b)!, links: Number(r.links), bridges: Number(r.bridges) }));
}

/** Documents the internal controls currently map to, with the number of controls (count only). */
export async function controlCoverage() {
  const rows = await prisma.$queryRaw<{ fw: string; controls: bigint; sections: bigint }[]>`
    SELECT c."frameworkId" AS fw, COUNT(DISTINCT x."controlId") AS controls, COUNT(DISTINCT c.id) AS sections
    FROM "ControlObligation" x JOIN "Citation" c ON c.id = x."citationId"
    GROUP BY 1`;
  const nm = await names(rows.map((r) => r.fw));
  const total = await prisma.ccfControl.count();
  return { controls: total, frameworks: rows.map((r) => ({ ...nm.get(r.fw)!, controls: Number(r.controls), sections: Number(r.sections) })).sort((x, y) => y.sections - x.sections) };
}

type Edge = { from: string; to: string; count: number };
const group = (items: string[]) => [...items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].map(([label, count]) => ({ label, count }));
const edges = (pairs: [string, string][]) => {
  const m = new Map<string, Edge>();
  for (const [from, to] of pairs) {
    const k = `${from}\u0000${to}`;
    const e = m.get(k) ?? { from, to, count: 0 };
    e.count++;
    m.set(k, e);
  }
  return [...m.values()];
};
/** Section text without the heading it repeats ("NIST SP 800-53 r5.1.1: AU-06-AUDIT RECORD REVIEW… a. Review…"). */
const withoutHeading = (name: string, text: string | null) => (text?.startsWith(name) ? text.slice(name.length).replace(/^[\s\-–:]+/, "") : text) || null;
const byId = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
const teamsOf = (scope: string | null) => (scope ?? "").split(/[,/;&]+|\band\b/i).map((t) => t.trim()).filter(Boolean);

/** How two documents connect: domain, segment and team views plus the section pairs. */
export async function frameworkConnection(a: string, b: string, basis: MatrixBasis) {
  const rows = basis === "controls"
    ? await prisma.$queryRaw<LinkRow[]>`
        SELECT ca.id AS a_id, ca."sourceSectionId" AS a_sid, ca."sectionName" AS a_name, ca."sectionText" AS a_text,
               cb.id AS b_id, cb."sourceSectionId" AS b_sid, cb."sectionName" AS b_name, cb."sectionText" AS b_text,
               x."controlId" AS bridge, ctl.scope AS team, NULL AS rel
        FROM "ControlObligation" x
        JOIN "ControlObligation" y ON y."controlId" = x."controlId"
        JOIN "Citation" ca ON ca.id = x."citationId"
        JOIN "Citation" cb ON cb.id = y."citationId"
        JOIN "CcfControl" ctl ON ctl.id = x."controlId"
        WHERE ca."frameworkId" = ${a} AND cb."frameworkId" = ${b}`
    : await prisma.$queryRaw<LinkRow[]>`
        SELECT ca.id AS a_id, ca."sourceSectionId" AS a_sid, ca."sectionName" AS a_name, ca."sectionText" AS a_text,
               cb.id AS b_id, cb."sourceSectionId" AS b_sid, cb."sectionName" AS b_name, cb."sectionText" AS b_text,
               NULL AS bridge, NULL AS team, r.status AS rel
        FROM "SourceRelationship" r
        JOIN "Citation" c1 ON c1.id = r."fromCitationId"
        JOIN "Citation" c2 ON c2.id = r."toCitationId"
        JOIN "Citation" ca ON ca.id = CASE WHEN c1."frameworkId" = ${a} THEN c1.id ELSE c2.id END
        JOIN "Citation" cb ON cb.id = CASE WHEN c1."frameworkId" = ${a} THEN c2.id ELSE c1.id END
        WHERE r.kind = 'CROSS_FRAMEWORK'
          AND ((c1."frameworkId" = ${a} AND c2."frameworkId" = ${b}) OR (c1."frameworkId" = ${b} AND c2."frameworkId" = ${a}))`;

  const nm = await names([a, b]);
  const dom = (n: string) => parseHeading(n).domain ?? "Other sections";
  const seg = (n: string) => { const h = parseHeading(n); return h.segment ?? h.domain ?? "Other sections"; };

  // One entry per distinct section pair; bridges and teams are aggregated, never listed. Sections are shown by
  // their publisher identifier (e.g. PR.AA-01, AC-02); the library's numeric Source Section IDs stay internal.
  type Sec = ReturnType<typeof sec>;
  const sec = (id: string, sid: string, name: string, text: string | null) =>
    ({ id, sourceSectionId: sid, identifier: parseHeading(name).identifier ?? name, domain: dom(name), sectionName: name, description: withoutHeading(name, text) });
  const pairs = new Map<string, { a: Sec; b: Sec; bridges: Set<string>; teams: Set<string>; types: Set<string> }>();
  for (const r of rows) {
    const k = `${r.a_id}|${r.b_id}`;
    const p = pairs.get(k) ?? { a: sec(r.a_id, r.a_sid, r.a_name, r.a_text), b: sec(r.b_id, r.b_sid, r.b_name, r.b_text), bridges: new Set(), teams: new Set(), types: new Set() };
    if (r.bridge) p.bridges.add(r.bridge);
    if (r.rel) p.types.add(r.rel);
    for (const t of teamsOf(r.team)) p.teams.add(t);
    pairs.set(k, p);
  }
  const list = [...pairs.values()];
  const aSections = [...new Map(list.map((p) => [p.a.id, p.a])).values()];
  const bSections = [...new Map(list.map((p) => [p.b.id, p.b])).values()];

  // Team level: A domain -> team -> B domain, counted per section pair.
  const teamPairs = list.flatMap((p) => [...p.teams].map((t) => ({ t, a: dom(p.a.sectionName), b: dom(p.b.sectionName) })));
  const bridges = new Set(list.flatMap((p) => [...p.bridges]));

  // Sections of each framework that appear in no relationship on this basis.
  const unmatchedOf = async (fw: string, matched: Sec[]) => {
    const ids = matched.map((x) => x.id);
    const where = { frameworkId: fw, id: { notIn: ids } };
    const [total, all, items] = await Promise.all([
      prisma.citation.count({ where: { frameworkId: fw } }),
      prisma.citation.count({ where }),
      prisma.citation.findMany({ where, orderBy: { sourceSectionId: "asc" }, take: 1000, select: { id: true, sourceSectionId: true, sectionName: true, sectionText: true } }),
    ]);
    return { total, count: all, items: items.map((c) => sec(c.id, c.sourceSectionId, c.sectionName, c.sectionText)).sort((x, y) => byId(x.identifier, y.identifier)) };
  };
  const [unmatchedA, unmatchedB] = await Promise.all([unmatchedOf(a, aSections), unmatchedOf(b, bSections)]);

  return {
    a: nm.get(a) ?? null,
    b: nm.get(b) ?? null,
    basis,
    links: list.length,
    unmatched: { a: unmatchedA, b: unmatchedB },
    bridges: bridges.size,
    domain: { left: group(aSections.map((s) => dom(s.sectionName))), right: group(bSections.map((s) => dom(s.sectionName))), edges: edges(list.map((p) => [dom(p.a.sectionName), dom(p.b.sectionName)])) },
    segment: { left: group(aSections.map((s) => seg(s.sectionName))), right: group(bSections.map((s) => seg(s.sectionName))), edges: edges(list.map((p) => [seg(p.a.sectionName), seg(p.b.sectionName)])) },
    team: {
      left: group(aSections.map((s) => dom(s.sectionName))),
      middle: group(teamPairs.map((x) => x.t)),
      right: group(bSections.map((s) => dom(s.sectionName))),
      edgesIn: edges(teamPairs.map((x) => [x.a, x.t])),
      edgesOut: edges(teamPairs.map((x) => [x.t, x.b])),
    },
    sections: list
      .map((p) => ({ a: p.a, b: p.b, via: p.bridges.size, teams: [...p.teams], types: [...p.types] }))
      .sort((x, y) => byId(x.a.identifier, y.a.identifier) || byId(x.b.identifier, y.b.identifier))
      .slice(0, 1000),
  };
}
export type FrameworkConnection = Awaited<ReturnType<typeof frameworkConnection>>;
