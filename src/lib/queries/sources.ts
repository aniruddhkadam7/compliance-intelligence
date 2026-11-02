// Sources: authoritative documents with version and update context. Global layer only, plus an
// optional count of client controls mapped to the document (client layer, read-only).
import { prisma } from "@/lib/db";
import { deriveFamily, shortName } from "@/lib/frameworks";

export function publisherOf(name: string) {
  const fam = deriveFamily(name);
  if (/^NIST/.test(fam)) return "NIST";
  if (/^ISO/.test(fam)) return "ISO / ISO-IEC";
  if (/^IEC/.test(fam)) return "IEC";
  if (/^CIS/.test(fam)) return "CIS";
  if (fam === "GDPR" || fam === "EU AI Act") return "European Union";
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
    version: f.versionLabel,
    previousVersion: previous ? { id: previous.id, short: shortName(previous.name), version: previous.versionLabel } : null,
    familyVersions: family.map((x) => ({ id: x.id, short: shortName(x.name), version: x.versionLabel })),
    obligations: f._count.citations,
    publishedDate: f.connectors.flatMap((c) => c.checks.map((k) => reportedDate(k.details))).find(Boolean) ?? null,
    monitoring: f.connectors.map((c) => ({ id: c.id, name: c.name, mechanism: c.mechanism, lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null, lastStatus: c.lastStatus, currentVersion: c.currentVersion })),
    updates,
    updateStatus: pending ? "REVIEW" : f.connectors.length ? "MONITORED" : "NOT_MONITORED",
  };
}

export async function listSources() {
  const docs = await load();
  return docs.map((f) => shape(f, docs));
}

export async function getSource(id: string) {
  const [docs, all] = await Promise.all([load({ id }), prisma.framework.findMany({ select: { id: true, name: true, family: true, versionLabel: true } })]);
  if (!docs[0]) return null;
  const base = shape(docs[0], all);

  // Supplied legacy -> latest transitions into this document, by status (real data only).
  const transitions = await prisma.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT r.status, COUNT(*) AS n FROM "SourceRelationship" r
    LEFT JOIN "Citation" t ON t.id = r."toCitationId"
    LEFT JOIN "Citation" f ON f.id = r."fromCitationId"
    WHERE r.kind = 'VERSION_TRANSITION' AND (t."frameworkId" = ${id} OR (r."toCitationId" IS NULL AND f."frameworkId" IN (
      SELECT x.id FROM "Framework" x WHERE x.family = ${docs[0].family ?? ""} AND x.id <> ${id})))
    GROUP BY r.status`;
  // Client controls mapped to this document (client layer, if uploaded).
  const clientControls = await prisma.ccfControl.count({ where: { obligations: { some: { citation: { frameworkId: id } } } } });
  return {
    ...base,
    transitions: Object.fromEntries(transitions.map((t) => [t.status, Number(t.n)])),
    clientControls,
  };
}

export type SourceRow = Awaited<ReturnType<typeof listSources>>[number];
export type SourceDetail = NonNullable<Awaited<ReturnType<typeof getSource>>>;
