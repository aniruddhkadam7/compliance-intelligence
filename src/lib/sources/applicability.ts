// IT / OT / AI applicability of an authoritative document. A supplied value (library import column)
// always wins; otherwise a tag is derived only when the document's own title states its subject.
export const APPLICABILITY_TAGS = ["IT", "OT", "AI"] as const;
export type ApplicabilityTag = (typeof APPLICABILITY_TAGS)[number];
export type ApplicabilityBasis = "SUPPLIED" | "TITLE" | "NONE";

const TITLE_RULES: [ApplicabilityTag, RegExp][] = [
  ["OT", /\bOT\b|operational technology|\bIACS\b|industrial (automation|control)/i],
  ["AI", /\bAI\b|artificial intelligence/i],
];

export function applicabilityOf(f: { name: string; applicability?: string | null }): { tags: ApplicabilityTag[]; basis: ApplicabilityBasis } {
  if (f.applicability) {
    const tags = APPLICABILITY_TAGS.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(f.applicability!));
    if (tags.length) return { tags, basis: "SUPPLIED" };
  }
  const tags = TITLE_RULES.filter(([, re]) => re.test(f.name)).map(([t]) => t);
  return tags.length ? { tags, basis: "TITLE" } : { tags: [], basis: "NONE" };
}

export const BASIS_LABEL: Record<ApplicabilityBasis, string> = {
  SUPPLIED: "Supplied in the document library",
  TITLE: "Derived from the document title; not yet confirmed",
  NONE: "Not classified yet",
};
