// Section headings and structural version comparison.
//
// Section names in the library are hierarchical: "<document> - <domain> - <segment> - <identifier>",
// e.g. "NIST CSF v2.0 - Govern (GV) - Risk Management Strategy (GV.RM) - GV.RM-04". Comparing two loaded
// versions by heading and identifier is a factual, structural comparison of the supplied text. It does not
// say how requirements moved between versions; a supplied transition mapping is needed for that.

export interface Heading { domain: string | null; segment: string | null; identifier: string | null }

export function parseHeading(sectionName: string): Heading {
  // Control catalogues named "NIST SP 800-53 r5.1.1: AC-02(01)-TITLE": identifier after the colon, family as domain.
  const control = sectionName.match(/^[^:]+:\s*([A-Z]{2,3}-\d+(?:\(\d+\))?)-/);
  if (control && !sectionName.includes(" - ")) return { domain: control[1].split("-")[0], segment: null, identifier: control[1] };
  const parts = sectionName.split(" - ").map((p) => p.trim()).filter(Boolean).slice(1);
  if (parts.length < 2) return { domain: null, segment: null, identifier: parts[0] ?? null };
  return { domain: parts[0], segment: parts.length > 2 ? parts[1] : null, identifier: parts[parts.length - 1] };
}

/** Heading text without parenthesised codes, for matching across versions ("Respond (RS)" → "respond"). */
const headingKey = (h: string) => h.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
/** Identifier with zero-padding removed ("RS.MI-01" → "RS.MI-1"). */
const idKey = (id: string) => id.replace(/(^|\D)0+(?=\d)/g, "$1").toUpperCase();
/** Requirement body for comparison: the text repeats its own heading (which names the version), so drop it. */
export const textKey = (s: ComparableSection) => {
  let t = s.sectionText ?? "";
  if (t.startsWith(s.sectionName)) t = t.slice(s.sectionName.length);
  else {
    const doc = s.sectionName.split(" - ")[0];
    if (doc && t.startsWith(doc)) t = t.replace(/^[^\n]*\n/, "");
  }
  // Only the requirement statement is compared: discussion and related-control notes are guidance.
  t = t.split(/\n\s*(Discussion|Related Controls|Supplemental Guidance):/i)[0];
  // Case, punctuation and spacing are ignored so line breaks and hyphenation in source files do not count as rewording.
  return t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
};

export interface ComparableSection { sourceSectionId: string; sectionName: string; sectionText: string | null }

export type HeadingStatus = "BOTH" | "ONLY_PREVIOUS" | "ONLY_CURRENT";
export interface HeadingRow { label: string; previous: number; current: number; status: HeadingStatus }
export interface SectionChange { identifier: string; previous?: ComparableSection; current?: ComparableSection }

export interface VersionComparison {
  domains: HeadingRow[];
  segments: HeadingRow[];
  identifiers: {
    comparable: boolean;
    unchanged: number;
    changed: SectionChange[];
    added: SectionChange[];
    removed: SectionChange[];
  };
  counts: { previous: number; current: number };
}

function headingRows(prev: ComparableSection[], cur: ComparableSection[], pick: (h: Heading) => string | null): HeadingRow[] {
  const rows = new Map<string, HeadingRow>();
  const add = (list: ComparableSection[], side: "previous" | "current") => {
    for (const s of list) {
      const h = pick(parseHeading(s.sectionName));
      if (!h) continue;
      const k = headingKey(h);
      const r = rows.get(k) ?? { label: h, previous: 0, current: 0, status: "BOTH" as HeadingStatus };
      r[side]++;
      if (side === "current") r.label = h; // show the current wording
      rows.set(k, r);
    }
  };
  add(prev, "previous");
  add(cur, "current");
  return [...rows.values()]
    .map((r) => ({ ...r, status: (r.previous && r.current ? "BOTH" : r.previous ? "ONLY_PREVIOUS" : "ONLY_CURRENT") as HeadingStatus }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

const bothHave = (a: ComparableSection[], b: ComparableSection[], pick: (h: Heading) => string | null) =>
  a.some((s) => pick(parseHeading(s.sectionName))) && b.some((s) => pick(parseHeading(s.sectionName)));

/**
 * Removes paragraphs that repeat across three or more sections of the same version (e.g. a category description
 * stored before each of its subcategories), so only each section's own requirement text is compared.
 */
export function stripSharedParagraphs(list: ComparableSection[]): ComparableSection[] {
  const paras = (s: ComparableSection) => (s.sectionText ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const freq = new Map<string, number>();
  for (const s of list) for (const p of new Set(paras(s).slice(1))) freq.set(p, (freq.get(p) ?? 0) + 1);
  return list.map((s) => {
    const ps = paras(s);
    if (ps.length < 3) return s;
    const kept = [ps[0], ...ps.slice(1).filter((p) => (freq.get(p) ?? 0) < 3)];
    return kept.length === ps.length || kept.length < 2 ? s : { ...s, sectionText: kept.join("\n\n") };
  });
}

export function compareVersions(prev: ComparableSection[], cur: ComparableSection[]): VersionComparison {
  prev = stripSharedParagraphs(prev);
  cur = stripSharedParagraphs(cur);
  // Heading rows (e.g. "Govern (GV)", "Asset Management (ID.AM)") are structure, not requirements.
  const isHeadingRow = (id: string) => /\s\(/.test(id);
  const byId = (list: ComparableSection[]) => {
    const m = new Map<string, ComparableSection>();
    let headings = 0;
    for (const s of list) {
      const id = parseHeading(s.sectionName).identifier;
      if (!id) continue;
      if (isHeadingRow(id)) { headings++; continue; }
      m.set(idKey(id), s);
    }
    return { m, headings };
  };
  const pb = byId(prev), cb = byId(cur);
  const p = pb.m, c = cb.m;
  // A requirement split into parts on one side only ("ID.RA-04-1", "ID.RA-04-2") is compared as one section.
  const mergeParts = (side: Map<string, ComparableSection>, other: Map<string, ComparableSection>) => {
    const parts = new Map<string, ComparableSection[]>();
    for (const [k, s] of side) {
      const base = k.match(/^(.*\d)-(\d)$/)?.[1];
      if (base && other.has(base) && !side.has(base) && !other.has(k)) parts.set(base, [...(parts.get(base) ?? []), s]);
    }
    for (const [base, list] of parts) {
      list.sort((x, y) => x.sectionName.localeCompare(y.sectionName, undefined, { numeric: true }));
      for (const s of list) side.delete(idKey(parseHeading(s.sectionName).identifier!));
      const first = list[0];
      side.set(base, { ...first, sectionName: first.sectionName.replace(/-\d$/, ""), sectionText: list.map((s) => textKey(s)).join(" ") });
    }
  };
  mergeParts(p, c);
  mergeParts(c, p);
  // Identifier matching is only meaningful when most requirement sections carry a parseable identifier.
  const comparable = p.size >= (prev.length - pb.headings) * 0.8 && c.size >= (cur.length - cb.headings) * 0.8;
  const changed: SectionChange[] = [], added: SectionChange[] = [], removed: SectionChange[] = [];
  let unchanged = 0;
  if (comparable) {
    for (const [k, s] of c) {
      const before = p.get(k);
      const identifier = parseHeading(s.sectionName).identifier!;
      if (!before) added.push({ identifier, current: s });
      else if (textKey(before) !== textKey(s)) changed.push({ identifier, previous: before, current: s });
      else unchanged++;
    }
    for (const [k, s] of p) if (!c.has(k)) removed.push({ identifier: parseHeading(s.sectionName).identifier!, previous: s });
  }
  const byIdentifier = (a: SectionChange, b: SectionChange) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
  return {
    // Headings are compared only when both versions carry them; otherwise there is nothing to compare.
    domains: bothHave(prev, cur, (h) => h.domain) ? headingRows(prev, cur, (h) => h.domain) : [],
    segments: bothHave(prev, cur, (h) => h.segment) ? headingRows(prev, cur, (h) => h.segment) : [],
    identifiers: { comparable, unchanged, changed: changed.sort(byIdentifier), added: added.sort(byIdentifier), removed: removed.sort(byIdentifier) },
    counts: { previous: prev.length, current: cur.length },
  };
}

export function comparisonSummary(c: VersionComparison) {
  return {
    domainsAdded: c.domains.filter((d) => d.status === "ONLY_CURRENT").map((d) => d.label),
    domainsRemoved: c.domains.filter((d) => d.status === "ONLY_PREVIOUS").map((d) => d.label),
    segmentsAdded: c.segments.filter((d) => d.status === "ONLY_CURRENT").length,
    segmentsRemoved: c.segments.filter((d) => d.status === "ONLY_PREVIOUS").length,
    comparable: c.identifiers.comparable,
    added: c.identifiers.added.length,
    removed: c.identifiers.removed.length,
    changed: c.identifiers.changed.length,
    unchanged: c.identifiers.unchanged,
    counts: c.counts,
  };
}
export type ComparisonSummary = ReturnType<typeof comparisonSummary>;
