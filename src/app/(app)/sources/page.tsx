import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { deriveFamily, shortName } from "@/lib/frameworks";
import { SourcesView, type SourceDoc } from "./sources-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

function publisher(name: string) {
  const fam = deriveFamily(name);
  if (/^NIST/.test(fam)) return "NIST";
  if (/^ISO/.test(fam)) return "ISO / ISO-IEC";
  if (/^IEC/.test(fam)) return "IEC 62443";
  if (/^CIS/.test(fam)) return "CIS";
  if (fam === "GDPR" || fam === "EU AI Act") return "EU regulation";
  return "Other";
}

/** Publication date reported by a connector check (catalogue "last modified" or latest consolidated text). */
function reportedDate(details: unknown): string | null {
  const d = (details ?? {}) as { lastModified?: string; latestConsolidated?: { date?: string | null } | null };
  return d.latestConsolidated?.date ?? d.lastModified ?? null;
}

export default async function SourcesPage() {
  const docs = await prisma.framework.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { citations: true } },
      connectors: {
        select: {
          name: true, currentVersion: true, lastCheckedAt: true,
          checks: { where: { status: { not: "ERROR" } }, orderBy: { checkedAt: "desc" }, take: 10, select: { details: true, detectedVersion: true } },
          updates: { orderBy: { detectedAt: "desc" }, take: 5, select: { id: true, changeType: true, title: true, summary: true, previousValue: true, newValue: true, reviewStatus: true, detectedAt: true } },
        },
      },
    },
  });

  const data: SourceDoc[] = docs.map((f) => {
    const sameFamily = docs.filter((x) => x.id !== f.id && x.family && x.family === f.family);
    const reported = f.connectors.flatMap((c) => c.checks.map((k) => reportedDate(k.details))).find(Boolean) ?? null;
    return {
      id: f.id,
      name: f.name,
      short: shortName(f.name),
      publisher: publisher(f.name),
      type: f.type,
      group: f.group,
      jurisdiction: f.jurisdiction,
      licensing: f.licensing,
      description: f.description,
      documentUrl: f.documentUrl,
      version: f.versionLabel,
      obligations: f._count.citations,
      lastUpdated: reported,
      monitored: f.connectors.length > 0,
      lastChecked: f.connectors.map((c) => c.lastCheckedAt).filter(Boolean).sort().pop()?.toISOString() ?? null,
      otherVersions: sameFamily.map((x) => ({ id: x.id, short: shortName(x.name), version: x.versionLabel })),
      detectedChanges: f.connectors.flatMap((c) => c.updates.map((u) => ({ ...u, detectedAt: u.detectedAt.toISOString(), connector: c.name }))),
    };
  });

  return (
    <Suspense>
      <SourcesView docs={data} />
    </Suspense>
  );
}
