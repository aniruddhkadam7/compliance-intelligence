// Measures how well the version comparison finds renumbered / split / combined sections, scored against the version
// transitions supplied in the CCF workbook's "Legacy Vs. Latest" sheet (default: NIST CSF 1.1 -> 2.0).
// Read-only: nothing is written to the database.
//
//   npx tsx scripts/eval-version-comparison.ts [family] [previousVersion] [currentVersion]
//
// Variants: rules only; rules + embedding similarity (what runs today); rules + similarity + AI review.
import { prisma } from "@/lib/db";
import { cosine, embed } from "@/lib/ai/embeddings";
import { reviewRelations, natureCounts } from "@/lib/ai/review-changes";
import { AI_MODEL } from "@/lib/ai/openai";
import { idKey, refineWithSemantics, relateVersions, relationCounts, type Relation } from "@/lib/sources/relations";
import { parseHeading } from "@/lib/sources/headings";

const [family = "NIST CSF", prevV = "1.1", curV = "2.0"] = process.argv.slice(2);

function score(name: string, rel: Relation[], truth: Set<string>, truthFrom: Set<string>) {
  const predicted = new Set(rel.filter((r) => ["RENUMBERED", "SPLIT", "COMBINED"].includes(r.kind))
    .flatMap((r) => r.from.flatMap((f) => r.to.map((t) => `${idKey(f)}|${idKey(t)}`))).filter((k) => k.split("|")[0] !== k.split("|")[1]));
  const hit = [...predicted].filter((k) => truth.has(k)).length;
  const p = predicted.size ? hit / predicted.size : 0, r = truth.size ? hit / truth.size : 0;
  // Old sections the publisher says carried on, but the comparison reports as removed.
  const wrongRemoved = rel.filter((x) => x.kind === "REMOVED" && truthFrom.has(idKey(x.from[0]))).length;
  const c = relationCounts(rel);
  console.log(`${name.padEnd(34)} precision ${(p * 100).toFixed(0).padStart(3)}%  recall ${(r * 100).toFixed(0).padStart(3)}%  F1 ${(p + r ? (200 * p * r) / (p + r) : 0).toFixed(0).padStart(3)}%  | links ${String(predicted.size).padStart(3)} correct ${String(hit).padStart(3)} | wrongly "removed" ${String(wrongRemoved).padStart(3)} | ${JSON.stringify(c)}`);
}

(async () => {
  const fws = await prisma.framework.findMany({ where: { family }, select: { id: true, versionLabel: true } });
  const a = fws.find((f) => f.versionLabel === prevV), b = fws.find((f) => f.versionLabel === curV);
  if (!a || !b) throw new Error(`${family} ${prevV} and ${curV} must both be in the library.`);
  const rows = (id: string) => prisma.citation.findMany({ where: { frameworkId: id }, orderBy: { sourceRow: "asc" }, select: { sourceSectionId: true, sectionName: true, sectionText: true } });
  const [prev, cur] = await Promise.all([rows(a.id), rows(b.id)]);
  // Answer key: supplied version transitions from a section of the old version to a section of the new one.
  const vt = await prisma.sourceRelationship.findMany({
    where: { kind: "VERSION_TRANSITION", fromCitation: { frameworkId: a.id }, toCitation: { frameworkId: b.id } },
    select: { status: true, fromCitation: { select: { sectionName: true } }, toCitation: { select: { sectionName: true } } },
  });
  const edges = vt.flatMap((r) => {
    const from = parseHeading(r.fromCitation!.sectionName).identifier, to = parseHeading(r.toCitation!.sectionName).identifier;
    return from && to ? [{ from, to, status: r.status }] : [];
  });
  const moved = edges.filter((e) => idKey(e.from) !== idKey(e.to));
  const truth = new Set(moved.map((e) => `${idKey(e.from)}|${idKey(e.to)}`));
  const truthFrom = new Set(moved.map((e) => idKey(e.from)));
  console.log(`${family} ${prevV} (${prev.length} sections) -> ${curV} (${cur.length} sections). Answer key (Legacy Vs. Latest): ${edges.length} transitions, ${truth.size} to a different identifier. Model: ${AI_MODEL()}\n`);

  const rules = relateVersions(prev, cur);
  score("1. Rules only", rules, truth, truthFrom);
  const sem = await refineWithSemantics(rules.map((r) => ({ ...r })), prev, cur, embed, cosine);
  score("2. Rules + similarity (today)", sem.relations, truth, truthFrom);
  const t0 = Date.now();
  const ai = await reviewRelations(sem.relations, prev, cur);
  score("3. Rules + similarity + AI review", ai.relations, truth, truthFrom);
  console.log(`\nAI review: ${ai.stats.note}\nTime ${((Date.now() - t0) / 1000).toFixed(0)}s · tokens in ${ai.stats.usage?.input ?? 0}, out ${ai.stats.usage?.output ?? 0}, calls ${ai.stats.usage?.calls ?? 0}`);
  console.log("Modified sections by nature:", JSON.stringify(natureCounts(ai.relations)));
  for (const r of ai.relations.filter((x) => x.kind === "MODIFIED" && x.review).slice(0, 6)) console.log(`  ${r.to[0]}: ${r.review!.nature} - ${r.review!.reason}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
