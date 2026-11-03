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
import { refineWithSemantics, relateVersions, relationCounts } from "@/lib/sources/relations";
import { generateProposals } from "./impact";

const json = (v: unknown) => v as Prisma.InputJsonValue;
export const LIBRARY_COMPARISON = "LIBRARY_COMPARISON";

export async function recordLibraryComparison(previousId: string, currentId: string, actor: string) {
  const existing = await prisma.aiIngestion.findFirst({ where: { status: "PUBLISHED", matchFrameworkId: previousId, publishedFrameworkId: currentId }, select: { id: true } });
  if (existing) return { id: existing.id, created: false, proposals: 0 };
  const [prevFw, curFw] = await Promise.all([previousId, currentId].map((id) => prisma.framework.findUnique({ where: { id }, select: { id: true, name: true, family: true, versionLabel: true } })));
  if (!prevFw || !curFw) throw new HttpError(404, "Both versions must be in the library.");
  if (!prevFw.family || prevFw.family !== curFw.family) throw new HttpError(422, "The two documents are not versions of the same framework.");

  const rows = (frameworkId: string) => prisma.citation.findMany({ where: { frameworkId }, orderBy: { sourceRow: "asc" }, select: { sourceSectionId: true, sectionName: true, sectionText: true } });
  const [prev, cur] = await Promise.all([rows(prevFw.id), rows(curFw.id)]);
  let relations = relateVersions(prev, cur);
  let semantic: { pairs: number; note: string };
  try {
    const r = await refineWithSemantics(relations, prev, cur, embed, cosine);
    relations = r.relations;
    semantic = { pairs: r.semanticPairs, note: "Semantic matches are mutual best matches with similarity of at least 80%; verify before relying on them." };
  } catch (e) {
    semantic = { pairs: 0, note: `Semantic matching unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const label = (f: { name: string; versionLabel: string | null }) => { const s = shortName(f.name); return f.versionLabel && !s.includes(f.versionLabel) ? `${s} ${f.versionLabel}` : s; };
  const before = snapshot(prev), after = snapshot(cur);
  const { summary } = await summariseChanges(label(prevFw), label(curFw), relations, new Map(Object.entries(before.texts)), new Map(Object.entries(after.texts)));

  const ing = await prisma.aiIngestion.create({
    data: {
      fileName: `Library comparison: ${label(prevFw)} → ${label(curFw)}`, fileHash: LIBRARY_COMPARISON, status: "PUBLISHED", model: AI_MODEL(), text: "", pages: 0, chunks: 0,
      detected: json({ source: LIBRARY_COMPARISON, title: curFw.name, shortTitle: label(curFw), libraryVersion: curFw.versionLabel }),
      matchFrameworkId: prevFw.id, matchKind: "NEW_VERSION", publishedFrameworkId: curFw.id, summary,
      analysis: json({ base: { id: prevFw.id, short: shortName(prevFw.name), version: prevFw.versionLabel }, counts: relationCounts(relations), relations, semantic, previous: before, current: { domains: after.domains } }),
      createdBy: actor, reviewedBy: actor, reviewedAt: new Date(), reviewNote: "Both versions were already in the library; recorded for change analytics.",
    },
  });
  await prisma.auditLog.create({ data: { actor, action: "LIBRARY_VERSIONS_COMPARED", entity: "AiIngestion", entityId: ing.id, details: json({ previousId, currentId }) } });
  const proposals = await generateProposals(ing.id, actor);
  return { id: ing.id, created: true, proposals: proposals.created };
}
