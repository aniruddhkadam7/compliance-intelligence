// Framework Matrix: framework-to-framework relationships.
//
// Basis "controls" reuses the existing mapping engine: two sections of different documents are related
// when the same internal control maps to both (ControlObligation). The controls themselves are never
// returned, only counts and the owning team scope, so no control IDs or control-framework terminology
// reach the screen. Basis "supplied" uses relationship files: cross-framework links and the version transitions
// between two versions of one document (e.g. NIST CSF 1.1 and 2.0). Nothing is inferred.
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { parseHeading } from "@/lib/sources/headings";

export const MATRIX_BASES = ["controls", "supplied"] as const;
export type MatrixBasis = (typeof MATRIX_BASES)[number];

interface LinkRow { a_id: string; a_sid: string; a_name: string; a_text: string | null; b_id: string; b_sid: string; b_name: string; b_text: string | null; rel: string | null }

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
        WHERE r.kind IN ('CROSS_FRAMEWORK', 'VERSION_TRANSITION') AND ca."frameworkId" <> cb."frameworkId"
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

/** Section text without the heading it repeats ("NIST SP 800-53 r5.1.1: AU-06-AUDIT RECORD REVIEW… a. Review…"). */
const withoutHeading = (name: string, text: string | null) => (text?.startsWith(name) ? text.slice(name.length).replace(/^[\s\-–:]+/, "") : text) || null;
const byId = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
/** Title that follows the identifier in the heading ("AC-02(01)-AUTOMATED SYSTEM ACCOUNT…" → "Automated system account…"), else "". */
const titleAfter = (name: string, identifier: string) => {
  const i = name.indexOf(identifier);
  const rest = i >= 0 ? name.slice(i + identifier.length).replace(/^[\s\-–:]+/, "") : "";
  return rest ? rest.charAt(0) + rest.slice(1).toLowerCase() : "";
};
/** Stated relationship types such as "MODIFIED" read as "Modified"; free text is kept as written. */
const pretty = (t: string) => (t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const clip = (t: string | null, n: number) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/**
 * A section as screens show it: its publisher identifier (e.g. PR.AA-01, AC-02), title, domain and wording. The
 * library's numeric Source Section IDs stay internal.
 */
export function sectionView(id: string, sid: string, name: string, text: string | null) {
  const full = parseHeading(name).identifier ?? name;
  // "11.300b Controls for identification codes" → identifier "11.300b", title "Controls for identification codes".
  const lead = full.match(/^(\S*\d\S*)\s+(\S.*)$/);
  const identifier = lead ? lead[1] : full;
  const title = titleAfter(name, full) || (lead ? lead[2] : "");
  return { id, sourceSectionId: sid, identifier, domain: parseHeading(name).domain ?? "Other sections", title, description: clip(withoutHeading(name, text), 400), href: null as string | null };
}

/** Section pairs returned for one framework pair. The largest supplied pair has about 2,000. */
const MAX_PAIRS = 5000;

/** How two documents connect: every related section pair, shown by publisher identifier, with its wording. */
export async function frameworkConnection(a: string, b: string, basis: MatrixBasis) {
  const rows = basis === "controls"
    ? await prisma.$queryRaw<LinkRow[]>`
        SELECT ca.id AS a_id, ca."sourceSectionId" AS a_sid, ca."sectionName" AS a_name, ca."sectionText" AS a_text,
               cb.id AS b_id, cb."sourceSectionId" AS b_sid, cb."sectionName" AS b_name, cb."sectionText" AS b_text,
               NULL AS rel
        FROM "ControlObligation" x
        JOIN "ControlObligation" y ON y."controlId" = x."controlId"
        JOIN "Citation" ca ON ca.id = x."citationId"
        JOIN "Citation" cb ON cb.id = y."citationId"
        WHERE ca."frameworkId" = ${a} AND cb."frameworkId" = ${b}`
    : await prisma.$queryRaw<LinkRow[]>`
        SELECT ca.id AS a_id, ca."sourceSectionId" AS a_sid, ca."sectionName" AS a_name, ca."sectionText" AS a_text,
               cb.id AS b_id, cb."sourceSectionId" AS b_sid, cb."sectionName" AS b_name, cb."sectionText" AS b_text,
               r.status AS rel
        FROM "SourceRelationship" r
        JOIN "Citation" c1 ON c1.id = r."fromCitationId"
        JOIN "Citation" c2 ON c2.id = r."toCitationId"
        JOIN "Citation" ca ON ca.id = CASE WHEN c1."frameworkId" = ${a} THEN c1.id ELSE c2.id END
        JOIN "Citation" cb ON cb.id = CASE WHEN c1."frameworkId" = ${a} THEN c2.id ELSE c1.id END
        WHERE r.kind IN ('CROSS_FRAMEWORK', 'VERSION_TRANSITION')
          AND ((c1."frameworkId" = ${a} AND c2."frameworkId" = ${b}) OR (c1."frameworkId" = ${b} AND c2."frameworkId" = ${a}))`;

  const nm = await names([a, b]);
  const sec = sectionView;
  type Sec = ReturnType<typeof sec>;
  const pairs = new Map<string, { a: Sec; b: Sec; types: Set<string> }>();
  for (const r of rows) {
    const k = `${r.a_id}|${r.b_id}`;
    const p = pairs.get(k) ?? { a: sec(r.a_id, r.a_sid, r.a_name, r.a_text), b: sec(r.b_id, r.b_sid, r.b_name, r.b_text), types: new Set<string>() };
    if (r.rel) p.types.add(pretty(r.rel));
    pairs.set(k, p);
  }
  const list = [...pairs.values()];

  return {
    a: nm.get(a) ?? null,
    b: nm.get(b) ?? null,
    basis,
    links: list.length,
    sections: list
      .map((p) => ({ a: p.a, b: p.b, types: [...p.types] }))
      .sort((x, y) => byId(x.a.identifier, y.a.identifier) || byId(x.b.identifier, y.b.identifier))
      .slice(0, MAX_PAIRS),
  };
}
export type FrameworkConnection = Awaited<ReturnType<typeof frameworkConnection>>;
