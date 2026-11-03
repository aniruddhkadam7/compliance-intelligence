// Relations between the sections of two versions. Identifiers are matched first; sections whose identifier
// exists on one side only are related by wording similarity, so a renumbered requirement is not reported as
// new. Every relation carries a confidence score and a plain explanation; nothing is asserted without one.
import { parseHeading, stripSharedParagraphs, type ComparableSection } from "./headings";

export type RelationKind = "UNCHANGED" | "MODIFIED" | "RENUMBERED" | "SPLIT" | "COMBINED" | "ADDED" | "REMOVED";
export interface Relation { kind: RelationKind; from: string[]; to: string[]; confidence: number; explanation: string }

export const idKey = (id: string) => id.replace(/(^|\D)0+(?=\d)/g, "$1").toUpperCase();
const STOP = new Set("the and for with that this are from shall must should may into its their such any all has have been not use used per which when where other each these those than then also within".split(" "));

/** Requirement wording as a set of words (heading line, discussion notes and stop words removed). */
export function words(s: ComparableSection) {
  let t = s.sectionText ?? "";
  if (t.startsWith(s.sectionName)) t = t.slice(s.sectionName.length);
  t = t.split(/\n\s*(Discussion|Related Controls|Supplemental Guidance):/i)[0];
  return new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)));
}
const inter = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
export const jaccard = (a: Set<string>, b: Set<string>) => (a.size || b.size ? inter(a, b) / (a.size + b.size - inter(a, b)) : 1);
/** Share of a's words that appear in b. */
const containment = (a: Set<string>, b: Set<string>) => (a.size ? inter(a, b) / a.size : 0);

const identifierOf = (s: ComparableSection) => parseHeading(s.sectionName).identifier;
const isHeadingRow = (id: string) => /\s\(/.test(id);

export function relateVersions(prev: ComparableSection[], cur: ComparableSection[]): Relation[] {
  prev = stripSharedParagraphs(prev);
  cur = stripSharedParagraphs(cur);
  const index = (list: ComparableSection[]) => {
    const m = new Map<string, { id: string; w: Set<string> }>();
    for (const s of list) { const id = identifierOf(s); if (id && !isHeadingRow(id) && !m.has(idKey(id))) m.set(idKey(id), { id, w: words(s) }); }
    return m;
  };
  const p = index(prev), c = index(cur);
  const out: Relation[] = [];
  for (const [k, a] of p) {
    const b = c.get(k);
    if (!b) continue;
    const sim = jaccard(a.w, b.w);
    out.push(sim >= 0.999
      ? { kind: "UNCHANGED", from: [a.id], to: [b.id], confidence: 1, explanation: "Same identifier and wording." }
      : { kind: "MODIFIED", from: [a.id], to: [b.id], confidence: Math.round(sim * 100) / 100, explanation: `Same identifier; ${Math.round(sim * 100)}% of the wording is shared.` });
  }
  const removed = [...p].filter(([k]) => !c.has(k)).map(([, v]) => v);
  const added = [...c].filter(([k]) => !p.has(k)).map(([, v]) => v);
  const usedR = new Set<string>(), usedA = new Set<string>();

  // Renumbered: one-to-one, strongest similarity first.
  const pairs = removed.flatMap((r) => added.map((a) => ({ r, a, sim: jaccard(r.w, a.w) }))).filter((x) => x.sim >= 0.8).sort((x, y) => y.sim - x.sim);
  for (const { r, a, sim } of pairs) {
    if (usedR.has(r.id) || usedA.has(a.id)) continue;
    usedR.add(r.id); usedA.add(a.id);
    out.push({ kind: "RENUMBERED", from: [r.id], to: [a.id], confidence: Math.round(sim * 100) / 100, explanation: `Identifier changed from ${r.id} to ${a.id}; ${Math.round(sim * 100)}% of the wording is shared.` });
  }
  // Split: one old section whose wording is spread over several new ones.
  for (const r of removed.filter((x) => !usedR.has(x.id))) {
    const parts = added.filter((a) => !usedA.has(a.id) && a.w.size >= 3 && containment(a.w, r.w) >= 0.6);
    if (parts.length < 2) continue;
    const union = new Set(parts.flatMap((a) => [...a.w]));
    const coverage = containment(r.w, union);
    if (coverage < 0.7) continue;
    usedR.add(r.id); parts.forEach((a) => usedA.add(a.id));
    out.push({ kind: "SPLIT", from: [r.id], to: parts.map((a) => a.id), confidence: Math.round(coverage * 100) / 100, explanation: `${r.id} appears divided into ${parts.map((a) => a.id).join(", ")} (${Math.round(coverage * 100)}% of its wording is covered).` });
  }
  // Combined: several old sections whose wording now sits in one new section.
  for (const a of added.filter((x) => !usedA.has(x.id))) {
    const parts = removed.filter((r) => !usedR.has(r.id) && r.w.size >= 3 && containment(r.w, a.w) >= 0.6);
    if (parts.length < 2) continue;
    const coverage = parts.reduce((n, r) => n + containment(r.w, a.w), 0) / parts.length;
    usedA.add(a.id); parts.forEach((r) => usedR.add(r.id));
    out.push({ kind: "COMBINED", from: parts.map((r) => r.id), to: [a.id], confidence: Math.round(coverage * 100) / 100, explanation: `${parts.map((r) => r.id).join(", ")} appear merged into ${a.id} (${Math.round(coverage * 100)}% average coverage).` });
  }
  for (const r of removed.filter((x) => !usedR.has(x.id))) out.push({ kind: "REMOVED", from: [r.id], to: [], confidence: 1, explanation: "No section with this identifier or similar wording exists in the new version." });
  for (const a of added.filter((x) => !usedA.has(x.id))) out.push({ kind: "ADDED", from: [], to: [a.id], confidence: 1, explanation: "No section with this identifier or similar wording exists in the previous version." });
  return out;
}

/**
 * Reconciles identifier/wording relations with a publisher-supplied crosswalk (old identifier -> new identifier).
 * Requirements the heuristics left as removed/added are linked where the publisher relates them, grouped into
 * renumbered (1:1), split (1:n) or combined (n:1 and n:m). Same-identifier pairs the crosswalk also lists are
 * marked as confirmed. Requirements the crosswalk does not relate stay removed/added.
 */
export function applyCrosswalk(rel: Relation[], edges: { from: string; to: string }[], publisher: string): Relation[] {
  const removed = new Map(rel.filter((r) => r.kind === "REMOVED").map((r) => [idKey(r.from[0]), r]));
  const added = new Map(rel.filter((r) => r.kind === "ADDED").map((r) => [idKey(r.to[0]), r]));
  const listed = new Set(edges.map((e) => `${idKey(e.from)}|${idKey(e.to)}`));
  const links = edges.filter((e) => removed.has(idKey(e.from)) && added.has(idKey(e.to)));

  // Connected groups of old and new identifiers.
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const e of links) parent.set(find(`o:${idKey(e.from)}`), find(`n:${idKey(e.to)}`));
  const groups = new Map<string, { from: Set<string>; to: Set<string> }>();
  for (const e of links) {
    const g = groups.get(find(`o:${idKey(e.from)}`)) ?? { from: new Set<string>(), to: new Set<string>() };
    g.from.add(idKey(e.from)); g.to.add(idKey(e.to));
    groups.set(find(`o:${idKey(e.from)}`), g);
  }

  const used = new Set<Relation>();
  const out: Relation[] = [];
  for (const g of groups.values()) {
    const from = [...g.from].map((k) => removed.get(k)!), to = [...g.to].map((k) => added.get(k)!);
    from.forEach((r) => used.add(r)); to.forEach((r) => used.add(r));
    const f = from.map((r) => r.from[0]), t = to.map((r) => r.to[0]);
    const kind: RelationKind = f.length === 1 && t.length === 1 ? "RENUMBERED" : f.length === 1 ? "SPLIT" : "COMBINED";
    out.push({
      kind, from: f, to: t, confidence: kind === "RENUMBERED" ? 0.9 : 0.8,
      explanation: kind === "RENUMBERED" ? `${publisher} relates ${f[0]} to ${t[0]} as the same requirement under a new identifier.`
        : kind === "SPLIT" ? `${publisher} relates ${f[0]} to ${t.join(", ")}: the requirement is now covered by several.`
        : `${publisher} relates ${f.join(", ")} to ${t.join(", ")}: the requirements are now covered together.`,
    });
  }
  return [
    ...rel.filter((r) => !used.has(r)).map((r) => (r.from.length === 1 && r.to.length === 1 && (r.kind === "MODIFIED" || r.kind === "UNCHANGED") && listed.has(`${idKey(r.from[0])}|${idKey(r.to[0])}`) ? { ...r, explanation: `${r.explanation} Confirmed by ${publisher}.` } : r)),
    ...out,
  ];
}

export function relationCounts(rel: Relation[]) {
  const c: Record<RelationKind, number> = { UNCHANGED: 0, MODIFIED: 0, RENUMBERED: 0, SPLIT: 0, COMBINED: 0, ADDED: 0, REMOVED: 0 };
  rel.forEach((r) => c[r.kind]++);
  return c;
}

/** Requirement text for semantic comparison (heading line and discussion removed). */
export function requirementText(s: ComparableSection) {
  let t = s.sectionText ?? "";
  if (t.startsWith(s.sectionName)) t = t.slice(s.sectionName.length);
  return t.split(/\n\s*(Discussion|Related Controls|Supplemental Guidance):/i)[0].replace(/\s+/g, " ").trim().slice(0, 1500);
}

/**
 * Semantic pass: removed and added sections whose meaning matches (mutual best, cosine ≥ threshold) are related as
 * renumbered; same-identifier pairs whose meaning differs are flagged as possibly reassigned. Similarity is evidence
 * to verify, not proof, and is labelled as such.
 */
export async function refineWithSemantics(rel: Relation[], prev: ComparableSection[], cur: ComparableSection[], embed: (t: string[]) => Promise<number[][]>, cosine: (a: number[], b: number[]) => number, threshold = 0.65) {
  const text = (list: ComparableSection[]) => new Map(stripSharedParagraphs(list).map((s) => [idKey(parseHeading(s.sectionName).identifier ?? ""), requirementText(s)]));
  const pt = text(prev), ct = text(cur);
  const removed = rel.filter((r) => r.kind === "REMOVED"), added = rel.filter((r) => r.kind === "ADDED");
  const modified = rel.filter((r) => r.kind === "MODIFIED" && r.confidence < 0.4);
  const rIds = removed.map((r) => r.from[0]), aIds = added.map((r) => r.to[0]);
  const all = [...rIds.map((i) => pt.get(idKey(i)) ?? ""), ...aIds.map((i) => ct.get(idKey(i)) ?? ""), ...modified.flatMap((m) => [pt.get(idKey(m.from[0])) ?? "", ct.get(idKey(m.to[0])) ?? ""])];
  if (!all.length) return { relations: rel, semanticPairs: 0 };
  const v = await embed(all);
  const R = v.slice(0, rIds.length), A = v.slice(rIds.length, rIds.length + aIds.length), M = v.slice(rIds.length + aIds.length);
  const best = (vec: number[], set: number[][]) => set.reduce((b, x, i) => { const c = cosine(vec, x); return c > b.c ? { i, c } : b; }, { i: -1, c: -1 });
  const pairs: { r: number; a: number; c: number }[] = [];
  R.forEach((rv, ri) => { const b = best(rv, A); if (b.i >= 0 && b.c >= threshold && best(A[b.i], R).i === ri) pairs.push({ r: ri, a: b.i, c: b.c }); });
  const out = rel.filter((x) => !pairs.some((p) => x === removed[p.r] || x === added[p.a]));
  for (const p of pairs)
    out.push({ kind: "RENUMBERED", from: [rIds[p.r]], to: [aIds[p.a]], confidence: Math.round(p.c * 100) / 100, explanation: `Semantic match: ${rIds[p.r]} and ${aIds[p.a]} express the same requirement (similarity ${Math.round(p.c * 100)}%) under a different identifier. Verify before relying on it.` });
  modified.forEach((m, i) => {
    const c = cosine(M[i * 2], M[i * 2 + 1]);
    if (c < threshold) m.explanation = `Same identifier, but the meaning differs (semantic similarity ${Math.round(c * 100)}%): the identifier may have been reassigned to a different requirement. Verify before relying on it.`;
  });
  return { relations: out, semanticPairs: pairs.length };
}
