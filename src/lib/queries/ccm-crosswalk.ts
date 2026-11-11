// CCM-based cross-framework mapping: one row per CSA Cloud Controls Matrix control, with the controls of every other
// framework it is mapped to. Data-driven and read-only: it shows only the cross-framework relationships written by a
// completed workbook import (SourceRelationship, kind CROSS_FRAMEWORK, with its ImportJob), never the built-in reference
// mappings or sample data, and never creates, infers or changes a mapping.
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { uninstalledVersions } from "@/lib/demo/state";
import { compareVersionLabels } from "@/lib/connectors/status";
import { versionOf } from "@/lib/sources/previous-versions";
import { REFERENCE_SHEET } from "@/lib/reference/mappings";

const CCM = "CSA CCM";
/** Columns shown first: the ISO, NIST and EU frameworks the team works with most. Others can be added in the page. */
const SUGGESTED = ["ISO/IEC 27001", "ISO/IEC 27002", "NIST CSF", "NIST SP 800-53", "EU AI Act", "GDPR"];

// ---------------------------------------------------------------------------------------------------------------------
// Control identifier and title from a section heading. Publishers write headings very differently, e.g.
//   "ISO/IEC 27018:2019 - 9 Access control - 9.4 System and application access control"   → 9.4 · System and application…
//   "9.1 - Monitoring, measurement, analysis and evaluation"                               → 9.1 · Monitoring, …
//   "NIST CSF v2.0 - Govern (GV) - Organizational Context (OC) - GV.OC-01"                → GV.OC-01 · Organizational Context (OC)
//   "NIST SP 800-53 r5.1.1: SC-12(05)-PKI CERTIFICATES / HARDWARE TOKENS"                 → SC-12(05) · Pki certificates / …
//   "EU AI Act - Chapter II - Prohibited AI Practices - Article 5(1)"                     → Article 5(1) · Prohibited AI Practices
//   "IEC Standard 62443-4-2:2019 … - Network and security configuration settings 11.8.2"  → 11.8.2 · Network and security…
// ---------------------------------------------------------------------------------------------------------------------

const KEYWORD_ID = /^((?:Article|Annex|Sec\.|Section|Control|Clause|Chapter|Part)\s+[0-9IVXLC]+[\w().]*)[\s:.,-]*(.*)$/;
/** "Obligations of Personal Information Processors: Article 51(3)": the identifier closes the heading. */
const KEYWORD_LAST = /^(.*\S)[\s:,-]+((?:Article|Annex|Sec\.|Section|Control|Clause|Chapter|Part)\s+[0-9IVXLC]+[\w().]*)$/;
const LEADING_ID = /^(\S*\d\S*?)[.:]?\s+(\S.*)$/;
const BARE_ID = /^\S*\d\S*$/;
const TRAILING_ID = /^(.*\D)\s+(\d+(?:\.\d+)+)$/;

function splitPart(p: string): { id: string | null; text: string } {
  const k = p.match(KEYWORD_ID);
  if (k) return { id: k[1], text: k[2].trim() };
  const kl = p.match(KEYWORD_LAST);
  if (kl) return { id: kl[2], text: kl[1].replace(/[\s:,-]+$/, "") };
  if (BARE_ID.test(p)) return { id: p.replace(/\.$/, ""), text: "" };
  const t = p.match(TRAILING_ID);
  if (t && !/^\S*\d/.test(p)) return { id: t[2], text: t[1].trim() };
  const l = p.match(LEADING_ID);
  if (l) return { id: l[1], text: l[2].trim() };
  return { id: null, text: p };
}

const sentence = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/** The publisher's identifier and title of a section, read from its heading. Falls back to the heading itself. */
export function controlLabel(sectionName: string): { identifier: string; title: string } {
  const name = sectionName.trim();
  // Control catalogues: "NIST SP 800-53 r5.1.1: AC-02(01)-AUTOMATED SYSTEM ACCOUNT MANAGEMENT".
  const cat = name.match(/^[^:]+:\s*([A-Z]{2,3}-\d+(?:\(\d+\))?)-(.*)$/);
  if (cat && !name.includes(" - ")) return { identifier: cat[1], title: sentence(cat[2].trim()) };

  const parts = name.split(" - ").map((p) => p.trim()).filter(Boolean);
  // The first part names the document ("ISO/IEC 27018:2019"), unless the heading starts with the clause ("9.1").
  if (parts.length > 1 && !/^\d/.test(parts[0])) parts.shift();
  const split = parts.map(splitPart);

  for (let i = split.length - 1; i >= 0; i--) {
    const { id, text } = split[i];
    if (!id) continue;
    // A bare identifier directly under another bare one ("5.3 - 2.1") keeps both, as the publisher numbers it.
    const prev = split[i - 1];
    const identifier = !text && prev?.id && !prev.text && !id.startsWith(prev.id) ? `${prev.id} ${id}` : id;
    // Title: the part's own text, else the headings after it, else the nearest heading above that has text.
    const after = split.slice(i + 1).map((s) => [s.id, s.text].filter(Boolean).join(" ")).filter(Boolean).join(" – ");
    const above = [...split.slice(0, i)].reverse().find((s) => s.text)?.text ?? "";
    return { identifier, title: text || after || above };
  }
  return { identifier: parts.at(-1) ?? name, title: "" };
}

/** Section text without the heading it repeats, up to its implementation guidance. */
const statement = (name: string, text: string | null) =>
  ((text?.startsWith(name) ? text.slice(name.length) : text) ?? "").split(/\n\s*Implementation Guidelines:/i)[0].trim() || null;

const byId = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });

/** Import kinds whose workbooks can carry a cross-framework mapping sheet. */
const MAPPING_IMPORTS = ["CLIENT_CONTROLS", "RELATIONSHIPS", "CCF_WORKBOOK"];

export type CcmState = "READY" | "NO_DATA" | "AWAITING_IMPORT" | "IMPORT_FAILED" | "EMPTY_IMPORT";
export interface ImportRef { id: string; fileName: string; at: string; status: string; errors: number; crossFramework: number | null }

/** A workbook attempt matters here when it holds cross-framework rows (or is a relationships file). */
const carriesMappings = (j: { kind: string; counts: unknown }) => {
  const n = (j.counts as { crossFramework?: number } | null)?.crossFramework;
  return j.kind === "RELATIONSHIPS" || (n ?? 0) > 0;
};

/**
 * The CCM page's state, from the import records. Mappings are shown only when a completed import wrote them; the
 * built-in reference mappings and anything not imported are never shown here.
 *   READY            a completed import holds CCM mappings (a newer pending or failed attempt is reported alongside)
 *   AWAITING_IMPORT  a workbook with mappings was uploaded and validated but not imported
 *   IMPORT_FAILED    the latest attempt to import such a workbook failed; nothing was written
 *   EMPTY_IMPORT     the latest import completed but contained no CCM mappings
 *   NO_DATA          no mapping workbook has been imported
 */
export async function ccmCrosswalk(): Promise<{ state: CcmState; source: (ImportRef & { links: number }) | null; attempt: ImportRef | null; data: CcmCrosswalk | null }> {
  const [notInstalled, jobs] = await Promise.all([
    uninstalledVersions(),
    prisma.importJob.findMany({
      where: { kind: { in: MAPPING_IMPORTS } }, orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, kind: true, fileName: true, status: true, counts: true, createdAt: true, completedAt: true, _count: { select: { issues: { where: { severity: "ERROR" } } } } },
    }),
  ]);
  const ref = (j: (typeof jobs)[number]): ImportRef => ({
    id: j.id, fileName: j.fileName, at: (j.completedAt ?? j.createdAt).toISOString(), status: j.status, errors: j._count.issues,
    crossFramework: (j.counts as { crossFramework?: number } | null)?.crossFramework ?? null,
  });
  const latestCompleted = jobs.find((j) => j.status === "COMPLETED");

  // Any completed import can replace the mappings, so the cached table is tied to the latest one.
  const key = `${latestCompleted?.id ?? "-"}|${[...notInstalled].sort().join(",")}`;
  if (!cache || cache.key !== key || Date.now() - cache.at > TTL) {
    const value = build(new Set(notInstalled), jobs.filter((j) => j.status === "COMPLETED").map((j) => j.id));
    cache = { key, at: Date.now(), value };
    value.catch(() => { cache = null; });
  }
  const built = await cache.value;

  const d = ccmImportState(jobs, built?.sourceJobId ?? null);
  if (d.state === "READY" && built && d.source) return { state: "READY", source: { ...ref(d.source), links: built.links }, attempt: d.attempt && ref(d.attempt), data: built.data };
  return { state: d.state, source: null, attempt: d.attempt && ref(d.attempt), data: null };
}

export interface ImportJobLite { id: string; kind: string; status: string; counts: unknown; createdAt: Date; completedAt: Date | null }

/**
 * Decides the page state from the import jobs (newest first) and the import the mappings came from, if any.
 * `attempt` is the upload to report: a newer validated or failed one, or for EMPTY_IMPORT the import that held no CCM mappings.
 */
export function ccmImportState<J extends ImportJobLite>(jobs: J[], sourceJobId: string | null): { state: CcmState; source: J | null; attempt: J | null } {
  const latestCompleted = jobs.find((j) => j.status === "COMPLETED") ?? null;
  const source = (sourceJobId && jobs.find((j) => j.id === sourceJobId && j.status === "COMPLETED")) || null;
  // The newest upload since the last completed import that was not imported. (Each import first records its validation
  // as a separate job, which stays "PREVIEWED"; it is older than the import it led to, so it is not counted.)
  const since = latestCompleted?.completedAt ?? new Date(0);
  const pending = jobs.find((j) => j.createdAt > since && j.status !== "COMPLETED" && carriesMappings(j)) ?? null;
  if (source) return { state: "READY", source, attempt: pending };
  if (pending?.status === "PREVIEWED") return { state: "AWAITING_IMPORT", source: null, attempt: pending };
  if (pending?.status === "FAILED") return { state: "IMPORT_FAILED", source: null, attempt: pending };
  if (latestCompleted) return { state: "EMPTY_IMPORT", source: null, attempt: latestCompleted };
  return { state: "NO_DATA", source: null, attempt: null };
}

/** The table changes only when mappings are imported or a demo update is installed, so it is kept briefly. */
const TTL = 5 * 60_000;
let cache: { key: string; at: number; value: Promise<Awaited<ReturnType<typeof build>>> } | null = null;

/** @param completedJobs completed imports, newest first. */
async function build(notInstalled: Set<string>, completedJobs: string[]) {
  const ccmSections = await prisma.citation.findMany({
    where: { framework: { family: CCM } },
    select: { id: true, frameworkId: true, sourceSectionId: true, sectionName: true, sectionText: true, raw: true },
  });
  if (!ccmSections.length || !completedJobs.length) return null;
  const ccmIds = ccmSections.map((c) => c.id);
  const ccmOf = new Map(ccmSections.map((c) => [c.id, c.frameworkId]));
  // Only relationships written by a completed workbook import (the built-in reference mappings carry no import).
  // Looked up by the indexed citation columns: far faster than joining every relationship to its sections.
  const links = await prisma.sourceRelationship.findMany({
    where: {
      kind: "CROSS_FRAMEWORK", importJobId: { in: completedJobs }, sourceSheet: { not: REFERENCE_SHEET },
      OR: [{ fromCitationId: { in: ccmIds } }, { toCitationId: { in: ccmIds } }],
    },
    select: { fromCitationId: true, toCitationId: true, importJobId: true },
  });
  if (!links.length) return null;
  // Each import replaces the previous mappings, so the rows come from one workbook: the newest import among them.
  const withLinks = new Set(links.map((l) => l.importJobId));
  const sourceJobId = completedJobs.find((id) => withLinks.has(id))!;

  // The base is the CCM version the imported mappings relate to (CCM v4.0); later CCM versions may have none.
  const counted = new Map<string, number>();
  for (const l of links) for (const id of [l.fromCitationId, l.toCitationId]) { const fw = id && ccmOf.get(id); if (fw) counted.set(fw, (counted.get(fw) ?? 0) + 1); }
  const versions = await prisma.framework.findMany({ where: { family: CCM }, select: { id: true, name: true, versionLabel: true } });
  const base = versions.sort((a, b) => (counted.get(b.id) ?? 0) - (counted.get(a.id) ?? 0) || compareVersionLabels(b.versionLabel, a.versionLabel))[0];

  const controls = ccmSections.filter((c) => c.frameworkId === base.id);
  // Control titles and domains as the CSA publishes them, from the other CCM versions in the library (same IDs).
  const titled = ccmSections.filter((c) => c.frameworkId !== base.id);
  const pairs = new Set<string>();
  const rels: { ccm: string; other: string }[] = [];
  for (const l of links) {
    if (!l.fromCitationId || !l.toCitationId) continue;
    const fromBase = ccmOf.get(l.fromCitationId) === base.id, toBase = ccmOf.get(l.toCitationId) === base.id;
    if (fromBase === toBase) continue;
    const r = fromBase ? { ccm: l.fromCitationId, other: l.toCitationId } : { ccm: l.toCitationId, other: l.fromCitationId };
    // The same pair can appear in both mapping sheets; it is one relationship.
    const k = `${r.ccm}|${r.other}`;
    if (!pairs.has(k)) { pairs.add(k); rels.push(r); }
  }

  const ccmTitle = new Map<string, string>();
  const ccmDomain = new Map<string, string>();
  for (const t of titled) {
    const r = t.raw as { identifier?: string; title?: string; path?: string[] } | null;
    if (!r?.identifier) continue;
    if (r.title) ccmTitle.set(r.identifier, r.title);
    if (r.path?.[0]) ccmDomain.set(r.identifier.split("-")[0], r.path[0]);
  }

  const others = await prisma.citation.findMany({
    where: { id: { in: [...new Set(rels.map((r) => r.other))] } },
    select: { id: true, sourceSectionId: true, sectionName: true, frameworkId: true },
  });
  const fwRows = await prisma.framework.findMany({
    where: { id: { in: [...new Set(others.map((o) => o.frameworkId))] } },
    select: { id: true, name: true, family: true, versionLabel: true, type: true },
  });
  // Versions not installed yet (an update still offered in Sources) are left out, as on the rest of the platform.
  const fws = new Map(fwRows.filter((f) => f.family !== CCM && !notInstalled.has(f.id)).map((f) => [f.id, f]));
  const other = new Map(others.filter((o) => fws.has(o.frameworkId)).map((o) => [o.id, o]));

  const sections: Record<string, { identifier: string; title: string; heading: string }> = {};
  const rowMaps = new Map<string, Record<string, string[]>>();
  const fwControls = new Map<string, Set<string>>();
  for (const r of rels) {
    const o = other.get(r.other);
    if (!o) continue;
    sections[o.sourceSectionId] ??= { ...controlLabel(o.sectionName), heading: o.sectionName };
    const m = rowMaps.get(r.ccm) ?? {};
    (m[o.frameworkId] ??= []).push(o.sourceSectionId);
    rowMaps.set(r.ccm, m);
    fwControls.set(o.frameworkId, (fwControls.get(o.frameworkId) ?? new Set()).add(r.ccm));
  }
  const sortIds = (ids: string[]) => [...new Set(ids)].sort((x, y) => byId(sections[x].identifier, sections[y].identifier));

  const rows = controls.map((c) => {
    const { identifier } = controlLabel(c.sectionName);
    const maps = rowMaps.get(c.id) ?? {};
    return {
      sourceSectionId: c.sourceSectionId,
      identifier,
      title: ccmTitle.get(identifier) ?? null,
      statement: statement(c.sectionName, c.sectionText),
      domain: ccmDomain.get(identifier.split("-")[0]) ?? identifier.split("-")[0],
      maps: Object.fromEntries(Object.entries(maps).map(([fw, ids]) => [fw, sortIds(ids)])),
    };
  }).sort((a, b) => byId(a.identifier, b.identifier));

  // Newest installed version of each suggested family is shown by default.
  const frameworks = [...fws.values()]
    .map((f) => ({ id: f.id, short: shortName(f.name), family: f.family, version: versionOf(f), type: f.type, controls: fwControls.get(f.id)?.size ?? 0 }))
    .sort((a, b) => (a.family ?? a.short).localeCompare(b.family ?? b.short) || compareVersionLabels(a.version, b.version));
  const preferred = SUGGESTED.map((fam) => frameworks.filter((f) => f.family === fam).at(-1)?.id).filter((x): x is string => !!x);
  // When the workbook maps none of the usual frameworks, every framework it maps is shown.
  const suggested = preferred.length ? preferred : frameworks.map((f) => f.id);
  if (!frameworks.length) return null;

  const data: CcmCrosswalk = {
    base: { id: base.id, short: shortName(base.name), version: versionOf(base), controls: rows.length, mapped: rows.filter((r) => Object.keys(r.maps).length).length },
    frameworks,
    suggested,
    sections,
    rows,
  };
  return { sourceJobId, links: rels.filter((r) => other.has(r.other)).length, data };
}

export interface CcmCrosswalk {
  base: { id: string; short: string; version: string | null; controls: number; mapped: number };
  frameworks: { id: string; short: string; family: string | null; version: string | null; type: string | null; controls: number }[];
  suggested: string[];
  sections: Record<string, { identifier: string; title: string; heading: string }>;
  rows: { sourceSectionId: string; identifier: string; title: string | null; statement: string | null; domain: string; maps: Record<string, string[]> }[];
}
export type CcmCrosswalkResponse = Awaited<ReturnType<typeof ccmCrosswalk>>;
