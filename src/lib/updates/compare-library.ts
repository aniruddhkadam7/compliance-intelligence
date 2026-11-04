// Version comparison for two versions that are both already in the library (e.g. loaded from the workbook
// rather than installed through an update). It is recorded like an installed update, so Change Analytics,
// client impact and remapping proposals work the same way. Nothing in the library is changed.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { shortName } from "@/lib/frameworks";
import { snapshot, summariseChanges } from "@/lib/ai/ingest";
import { AI_MODEL } from "@/lib/ai/openai";
import { cosine, embed } from "@/lib/ai/embeddings";
import { parseHeading } from "@/lib/sources/headings";
import { applyCrosswalk, idKey, refineWithSemantics, relateVersions, relationCounts } from "@/lib/sources/relations";
import { generateProposals } from "./impact";

const json = (v: unknown) => v as Prisma.InputJsonValue;
export const LIBRARY_COMPARISON = "LIBRARY_COMPARISON";
const PUBLISHER_CROSSWALK = "NIST's official CSF 2.0 crosswalk";

const label = (f: { name: string; versionLabel: string | null }) => { const s = shortName(f.name); return f.versionLabel && !s.includes(f.versionLabel) ? `${s} ${f.versionLabel}` : s; };

/**
 * Publisher-supplied correspondences between two versions already in the library (imported relationship files,
 * e.g. NIST's informative references). Only exact requirement references count: a reference to a whole category
 * ("PR.DS") says nothing about which requirement replaced which.
 */
async function suppliedCrosswalk(previousId: string, currentId: string) {
  const rows = await prisma.sourceRelationship.findMany({
    where: { kind: "CROSS_FRAMEWORK", OR: [{ fromCitation: { frameworkId: previousId }, toCitation: { frameworkId: currentId } }, { fromCitation: { frameworkId: currentId }, toCitation: { frameworkId: previousId } }] },
    select: { note: true, fromCitation: { select: { sectionName: true, frameworkId: true } }, toCitation: { select: { sectionName: true } } },
  });
  const edges = new Map<string, { from: string; to: string }>();
  for (const r of rows) {
    if (!r.fromCitation || !r.toCitation) continue;
    const a = parseHeading(r.fromCitation.sectionName).identifier, b = parseHeading(r.toCitation.sectionName).identifier;
    const ref = (r.note ?? "").trim().split(/\s+/).pop() ?? "";
    // The referenced side is the relationship's target; its identifier must be the requirement the note names.
    if (!a || !b || !/-\d+$/.test(ref) || !(idKey(b) === idKey(ref) || idKey(b).startsWith(`${idKey(ref)}-`))) continue;
    const e = r.fromCitation.frameworkId === previousId ? { from: a, to: b } : { from: b, to: a };
    edges.set(`${idKey(e.from)}|${idKey(e.to)}`, e);
  }
  return [...edges.values()];
}

const versionParts = (v: string | null) => (v ?? "").split(".").map((n) => parseInt(n, 10) || 0);
function byVersion(x: string | null, y: string | null) {
  const a = versionParts(x), b = versionParts(y);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/** Consecutive versions of each framework family in the library, and whether their comparison is recorded. */
export async function libraryComparisonPairs() {
  const fws = await prisma.framework.findMany({ where: { family: { not: null }, versionLabel: { not: null } }, select: { id: true, name: true, family: true, versionLabel: true } });
  const done = await prisma.aiIngestion.findMany({ where: { status: "PUBLISHED", matchFrameworkId: { not: null }, publishedFrameworkId: { not: null } }, select: { id: true, matchFrameworkId: true, publishedFrameworkId: true, analysis: true } });
  const reviewed = new Set((await prisma.mappingProposal.groupBy({ by: ["ingestionId"], where: { status: { not: "PENDING" }, ingestionId: { in: done.map((d) => d.id) } } })).map((g) => g.ingestionId));
  const byFamily = new Map<string, typeof fws>();
  for (const f of fws) byFamily.set(f.family!, [...(byFamily.get(f.family!) ?? []), f]);
  const pairs: { family: string; previous: { id: string; label: string }; current: { id: string; label: string }; updateId: string | null; crosswalk: boolean; canRecompute: boolean }[] = [];
  for (const [family, list] of byFamily) {
    const sorted = list.sort((x, y) => byVersion(x.versionLabel, y.versionLabel));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      const rec = done.find((d) => d.matchFrameworkId === prev.id && d.publishedFrameworkId === cur.id);
      pairs.push({
        family, previous: { id: prev.id, label: label(prev) }, current: { id: cur.id, label: label(cur) }, updateId: rec?.id ?? null,
        crosswalk: !!(rec?.analysis as { crosswalk?: unknown } | null)?.crosswalk, canRecompute: !!rec && !reviewed.has(rec.id),
      });
    }
  }
  return pairs.sort((x, y) => x.family.localeCompare(y.family));
}

/**
 * Records (or, with refresh, re-derives) the comparison of two library versions. Refreshing replaces the analysis
 * and the still-pending proposals; it is refused once any proposal has been reviewed, because approved mappings
 * depend on it.
 */
export async function recordLibraryComparison(previousId: string, currentId: string, actor: string, opts: { refresh?: boolean } = {}) {
  const existing = await prisma.aiIngestion.findFirst({ where: { status: "PUBLISHED", matchFrameworkId: previousId, publishedFrameworkId: currentId }, select: { id: true } });
  if (existing && !opts.refresh) return { id: existing.id, created: false, proposals: 0 };
  if (existing && (await prisma.mappingProposal.count({ where: { ingestionId: existing.id, status: { not: "PENDING" } } })))
    throw new HttpError(409, "Mapping suggestions from this comparison have already been reviewed, so it can no longer be recomputed.");
  const [prevFw, curFw] = await Promise.all([previousId, currentId].map((id) => prisma.framework.findUnique({ where: { id }, select: { id: true, name: true, family: true, versionLabel: true } })));
  if (!prevFw || !curFw) throw new HttpError(404, "Both versions must be in the library.");
  if (!prevFw.family || prevFw.family !== curFw.family) throw new HttpError(422, "The two documents are not versions of the same framework.");

  const rows = (frameworkId: string) => prisma.citation.findMany({ where: { frameworkId }, orderBy: { sourceRow: "asc" }, select: { sourceSectionId: true, sectionName: true, sectionText: true } });
  const [prev, cur] = await Promise.all([rows(prevFw.id), rows(curFw.id)]);
  let relations = relateVersions(prev, cur);

  // The publisher's own crosswalk, where one has been imported, decides what was renumbered, split or combined.
  const edges = await suppliedCrosswalk(prevFw.id, curFw.id);
  let crosswalk: { source: string; references: number; resolved: number } | undefined;
  if (edges.length) {
    const open = (r: typeof relations) => r.filter((x) => x.kind === "REMOVED" || x.kind === "ADDED").length;
    const unresolved = open(relations);
    relations = applyCrosswalk(relations, edges, PUBLISHER_CROSSWALK);
    crosswalk = { source: PUBLISHER_CROSSWALK, references: edges.length, resolved: unresolved - open(relations) };
  }

  let semantic: { pairs: number; note: string };
  try {
    const r = await refineWithSemantics(relations, prev, cur, embed, cosine);
    relations = r.relations;
    semantic = { pairs: r.semanticPairs, note: "Semantic matches are mutual best matches with similarity of at least 80%; verify before relying on them." };
  } catch (e) {
    semantic = { pairs: 0, note: `Semantic matching unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const before = snapshot(prev), after = snapshot(cur);
  const { summary } = await summariseChanges(label(prevFw), label(curFw), relations, new Map(Object.entries(before.texts)), new Map(Object.entries(after.texts)));

  const data = {
    fileName: `Library comparison: ${label(prevFw)} → ${label(curFw)}`, fileHash: LIBRARY_COMPARISON, status: "PUBLISHED", model: AI_MODEL(), text: "", pages: 0, chunks: 0,
    detected: json({ source: LIBRARY_COMPARISON, title: curFw.name, shortTitle: label(curFw), libraryVersion: curFw.versionLabel }),
    matchFrameworkId: prevFw.id, matchKind: "NEW_VERSION", publishedFrameworkId: curFw.id, summary,
    analysis: json({ base: { id: prevFw.id, short: shortName(prevFw.name), version: prevFw.versionLabel }, counts: relationCounts(relations), relations, semantic, crosswalk, previous: before, current: { domains: after.domains } }),
  };
  let id: string;
  if (existing) {
    await prisma.$transaction([
      prisma.mappingProposal.deleteMany({ where: { ingestionId: existing.id } }),
      prisma.aiIngestion.update({ where: { id: existing.id }, data: { ...data, reviewNote: "Both versions were already in the library; comparison recomputed for change analytics." } }),
    ]);
    id = existing.id;
  } else {
    id = (await prisma.aiIngestion.create({ data: { ...data, createdBy: actor, reviewedBy: actor, reviewedAt: new Date(), reviewNote: "Both versions were already in the library; recorded for change analytics." } })).id;
  }
  await prisma.auditLog.create({ data: { actor, action: existing ? "LIBRARY_COMPARISON_RECOMPUTED" : "LIBRARY_VERSIONS_COMPARED", entity: "AiIngestion", entityId: id, details: json({ previousId, currentId, crosswalkReferences: edges.length }) } });
  const proposals = await generateProposals(id, actor);
  return { id, created: !existing, proposals: proposals.created };
}

let ensuring: Promise<void> | null = null;

/**
 * Keeps Change Analytics current without anyone asking: every pair of consecutive library versions gets a
 * comparison, and a comparison made before the publisher's crosswalk was imported is redone (only while none of
 * its suggestions has been reviewed). One run at a time; a failure leaves the pair for the next visit.
 */
export function ensureLibraryComparisons(actor = "system") {
  ensuring ??= (async () => {
    for (const p of await libraryComparisonPairs()) {
      try {
        if (!p.updateId) await recordLibraryComparison(p.previous.id, p.current.id, actor);
        else if (!p.crosswalk && p.canRecompute && (await suppliedCrosswalk(p.previous.id, p.current.id)).length) await recordLibraryComparison(p.previous.id, p.current.id, actor, { refresh: true });
      } catch (e) { console.error(`Library comparison ${p.previous.label} → ${p.current.label} failed:`, e); }
    }
  })().finally(() => { ensuring = null; });
  return ensuring;
}
