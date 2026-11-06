// Sources: authoritative documents with version and update context. Global layer only, plus an
// optional count of client controls mapped to the document (client layer, read-only).
import { prisma } from "@/lib/db";
import { deriveFamily, shortName } from "@/lib/frameworks";
import { MECHANISM_LABEL, type Mechanism } from "@/lib/connectors/types";
import { applicabilityOf } from "@/lib/sources/applicability";
import { previousVersionOf, versionOf } from "@/lib/sources/previous-versions";
import { compareVersions, comparisonSummary } from "@/lib/sources/headings";

export function publisherOf(name: string) {
  const fam = deriveFamily(name);
  if (/^NIST/.test(fam)) return "NIST";
  if (/^ISO/.test(fam)) return "ISO / ISO-IEC";
  if (/^IEC/.test(fam)) return "IEC";
  if (/^CIS/.test(fam)) return "CIS";
  if (fam === "GDPR" || fam === "EU AI Act") return "European Union";
  if (/^CSA|Cloud Controls Matrix/.test(fam)) return "Cloud Security Alliance";
  if (/^COBIT/.test(fam)) return "ISACA";
  if (fam === "21 CFR Part 11") return "US FDA";
  if (fam === "SOX") return "US Congress";
  if (fam === "China PIPL") return "China NPC";
  return "Other";
}

/** Publication date reported by a connector check (catalogue "last modified" or latest consolidated text). */
function reportedDate(details: unknown): string | null {
  const d = (details ?? {}) as { lastModified?: string; latestConsolidated?: { date?: string | null } | null };
  return d.latestConsolidated?.date ?? d.lastModified ?? null;
}

const versionKey = (v: string | null) => (v ?? "").split(/[^\d]+/).filter(Boolean).map(Number);
const cmpVersion = (a: string | null, b: string | null) => {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

async function load(where?: { id: string }) {
  return prisma.framework.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { citations: true } },
      connectors: {
        select: {
          id: true, name: true, mechanism: true, officialUrl: true, currentVersion: true, lastCheckedAt: true, lastStatus: true,
          checks: { where: { status: { not: "ERROR" } }, orderBy: { checkedAt: "desc" }, take: 10, select: { details: true, detectedVersion: true, checkedAt: true } },
          updates: { orderBy: { detectedAt: "desc" }, take: 10, select: { id: true, changeType: true, title: true, summary: true, previousValue: true, newValue: true, reviewStatus: true, detectedAt: true } },
        },
      },
    },
  });
}

function shape(f: Awaited<ReturnType<typeof load>>[number], all: { id: string; name: string; family: string | null; versionLabel: string | null }[]) {
  const family = all.filter((x) => x.family && x.family === f.family).sort((a, b) => cmpVersion(a.versionLabel, b.versionLabel));
  const idx = family.findIndex((x) => x.id === f.id);
  const previous = idx > 0 ? family[idx - 1] : null;
  const updates = f.connectors.flatMap((c) => c.updates.map((u) => ({ ...u, detectedAt: u.detectedAt.toISOString(), connector: c.name })));
  const pending = updates.filter((u) => u.reviewStatus === "NEW").length;
  return {
    id: f.id,
    sourceId: f.sourceId,
    name: f.name,
    short: shortName(f.name),
    publisher: publisherOf(f.name),
    type: f.type,
    industry: f.group,
    jurisdiction: f.jurisdiction,
    licensing: f.licensing,
    description: f.description,
    documentUrl: f.documentUrl,
    version: versionOf(f),
    previousVersion: previous ? { id: previous.id, short: shortName(previous.name), version: previous.versionLabel } : null,
    familyVersions: family.map((x) => ({ id: x.id, short: shortName(x.name), version: x.versionLabel })),
    // Predecessor as stated by the publisher, recorded even when its text is not loaded.
    recordedPrevious: previousVersionOf(f),
    obligations: f._count.citations,
    publishedDate: f.connectors.flatMap((c) => c.checks.map((k) => reportedDate(k.details))).find(Boolean) ?? null,
    monitoring: f.connectors.map((c) => ({ id: c.id, name: c.name, mechanism: c.mechanism, lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null, lastStatus: c.lastStatus, currentVersion: c.currentVersion })),
    updates,
    updateStatus: pending ? "REVIEW" : f.connectors.length ? "MONITORED" : "NOT_MONITORED",
    pendingReview: pending,
    applicability: applicabilityOf(f),
    collection: f.connectors.length
      ? { automated: true, methods: [...new Set(f.connectors.map((c) => MECHANISM_LABEL[c.mechanism as Mechanism] ?? c.mechanism))] }
      : { automated: false, methods: ["Library import (Excel workbook)"] },
    loadedAt: f.updatedAt.toISOString(),
  };
}

const SECTION = { sourceSectionId: true, sectionName: true, sectionText: true } as const;

/** Structural comparison of each document with its previous loaded version (headings and identifiers). */
async function comparisons(pairs: { id: string; previousId: string }[]) {
  if (!pairs.length) return new Map<string, ReturnType<typeof compareVersions>>();
  const ids = [...new Set(pairs.flatMap((p) => [p.id, p.previousId]))];
  const rows = await prisma.citation.findMany({ where: { frameworkId: { in: ids } }, select: { ...SECTION, frameworkId: true } });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.frameworkId, [...(by.get(r.frameworkId) ?? []), r]);
  return new Map(pairs.map((p) => [p.id, compareVersions(by.get(p.previousId) ?? [], by.get(p.id) ?? [])]));
}

/**
 * Uploaded new versions not yet installed, newest per document. "released" means an admin reviewed it and
 * users can apply it with the Update button; otherwise it is still in admin review.
 */
async function pendingImports(frameworkId?: string) {
  const drafts = await prisma.aiIngestion.findMany({
    where: { status: "READY", matchKind: "NEW_VERSION", matchFrameworkId: frameworkId ?? { not: null } },
    orderBy: { createdAt: "desc" }, select: { id: true, matchFrameworkId: true, detected: true, createdAt: true },
  });
  const pending = new Map<string, { id: string; version: string | null; uploadedAt: string; released: boolean }>();
  for (const x of drafts) {
    if (pending.has(x.matchFrameworkId!)) continue;
    const det = (x.detected ?? {}) as { libraryVersion?: string; release?: unknown };
    pending.set(x.matchFrameworkId!, { id: x.id, version: det.libraryVersion ?? null, uploadedAt: x.createdAt.toISOString(), released: !!det.release });
  }
  return pending;
}

/** READY: released by an admin, install with Update. AVAILABLE: newer version at the publisher. NEWER_IN_LIBRARY: a later version is already installed. */
export type FrameworkUpdateKind = "READY" | "AVAILABLE" | "NEWER_IN_LIBRARY";
export interface FrameworkUpdate { frameworkId: string; short: string; from: string | null; to: string | null; latest: string | null; kind: FrameworkUpdateKind }

/** Documents with a newer version, by how far along the update is. Used to flag the client controls mapped to them. */
export async function frameworkUpdates(): Promise<Map<string, FrameworkUpdate>> {
  const [pending, fws] = await Promise.all([pendingImports(), prisma.framework.findMany({ select: { id: true, name: true, sourceId: true, family: true, versionLabel: true } })]);
  const checks = await latestChecks(fws.map((f) => f.id));
  const out = new Map<string, FrameworkUpdate>();
  for (const f of fws) {
    const p = pending.get(f.id), c = checks.get(f.id);
    const newest = fws.filter((x) => x.family && x.family === f.family).sort((a, b) => cmpVersion(a.versionLabel, b.versionLabel)).at(-1);
    const base = { frameworkId: f.id, short: shortName(f.name), from: versionOf(f) };
    if (p?.released) out.set(f.id, { ...base, to: p.version, latest: null, kind: "READY" });
    else if (newest && newest.id !== f.id) out.set(f.id, { ...base, to: versionOf(newest), latest: shortName(newest.name), kind: "NEWER_IN_LIBRARY" });
    else if (c?.status === "UPDATE_AVAILABLE") out.set(f.id, { ...base, to: c.latestVersion, latest: null, kind: "AVAILABLE" });
  }
  return out;
}

/** Documents with a released update waiting for a user to click Update (the Sources badge). */
export const releasedUpdateCount = async () => [...(await pendingImports()).values()].filter((p) => p.released).length;

export async function listSources() {
  const docs = await load();
  const shaped = docs.map((f) => shape(f, docs));
  const cmp = await comparisons(shaped.filter((d) => d.previousVersion).map((d) => ({ id: d.id, previousId: d.previousVersion!.id })));
  const checks = await latestChecks(shaped.map((d) => d.id));
  const pending = await pendingImports();
  // Version update that installed each document (its comparison with the version it replaced), newest first.
  const installs = await prisma.aiIngestion.findMany({ where: { status: "PUBLISHED", publishedFrameworkId: { in: shaped.map((d) => d.id) } }, orderBy: { updatedAt: "desc" }, select: { id: true, publishedFrameworkId: true } });
  const installed = new Map<string, string>();
  for (const x of installs) if (!installed.has(x.publishedFrameworkId!)) installed.set(x.publishedFrameworkId!, x.id);
  return shaped.map((d) => ({ ...d, pendingImport: pending.get(d.id) ?? null, installedUpdate: installed.get(d.id) ?? null, latestCheck: checks.get(d.id) ?? null, comparison: cmp.has(d.id) ? comparisonSummary(cmp.get(d.id)!) : null }));
}

const CHECK_SELECT = { id: true, frameworkId: true, method: true, sourceUrl: true, status: true, approvedVersion: true, latestVersion: true, publicationDate: true, latestDocumentUrl: true, evidence: true, message: true, checkedBy: true, checkedAt: true } as const;

/** Most recent "Check for Updates" result per document. */
async function latestChecks(ids: string[]) {
  const rows = await prisma.updateCheck.findMany({ where: { frameworkId: { in: ids } }, orderBy: { checkedAt: "desc" }, select: CHECK_SELECT });
  const m = new Map<string, Omit<(typeof rows)[number], "checkedAt"> & { checkedAt: string }>();
  for (const r of rows) if (!m.has(r.frameworkId)) m.set(r.frameworkId, { ...r, checkedAt: r.checkedAt.toISOString() });
  return m;
}

export async function getSource(id: string) {
  const [docs, all] = await Promise.all([load({ id }), prisma.framework.findMany({ select: { id: true, name: true, family: true, versionLabel: true } })]);
  if (!docs[0]) return null;
  const base = shape(docs[0], all);
  const comparison = base.previousVersion ? (await comparisons([{ id, previousId: base.previousVersion.id }])).get(id)! : null;

  // Supplied legacy -> latest transitions into this document, by status (real data only).
  const transitions = await prisma.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT r.status, COUNT(*) AS n FROM "SourceRelationship" r
    LEFT JOIN "Citation" t ON t.id = r."toCitationId"
    LEFT JOIN "Citation" f ON f.id = r."fromCitationId"
    WHERE r.kind = 'VERSION_TRANSITION' AND (t."frameworkId" = ${id} OR (r."toCitationId" IS NULL AND f."frameworkId" IN (
      SELECT x.id FROM "Framework" x WHERE x.family = ${docs[0].family ?? ""} AND x.id <> ${id})))
    GROUP BY r.status`;
  // Latest reviewed AI import that produced or updated this document (summary is AI output, reviewed before publishing).
  const aiImport = await prisma.aiIngestion.findFirst({
    where: { publishedFrameworkId: id, status: "PUBLISHED" }, orderBy: { updatedAt: "desc" },
    select: { id: true, summary: true, model: true, reviewedBy: true, updatedAt: true, fileName: true },
  });
  return {
    ...base,
    aiImport: aiImport ? { ...aiImport, updatedAt: aiImport.updatedAt.toISOString() } : null,
    installedUpdate: aiImport?.id ?? null,
    transitions: Object.fromEntries(transitions.map((t) => [t.status, Number(t.n)])),
    pendingImport: (await pendingImports(id)).get(id) ?? null,
    comparison,
    latestCheck: (await latestChecks([id])).get(id) ?? null,
    checkHistory: (await prisma.updateCheck.findMany({ where: { frameworkId: id }, orderBy: { checkedAt: "desc" }, take: 15, select: CHECK_SELECT })).map((r) => ({ ...r, checkedAt: r.checkedAt.toISOString() })),
  };
}

export type SourceRow = Awaited<ReturnType<typeof listSources>>[number];
export type SourceDetail = NonNullable<Awaited<ReturnType<typeof getSource>>>;
