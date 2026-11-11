import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { CONNECTORS, ensureConnectors } from "@/lib/connectors/registry";
import { MECHANISM_LABEL } from "@/lib/connectors/types";
import { comparableVersion, compareVersionLabels, publisherIsNewer, readableVersion, responseSummary } from "@/lib/connectors/status";
import { shortName } from "@/lib/frameworks";
import { demoBaselines } from "@/lib/demo/state";
import { versionOf } from "@/lib/sources/previous-versions";

export const GET = handle(async () => {
  await requireSession();
  await ensureConnectors();
  const [baselines, library, rows] = await Promise.all([
    demoBaselines(),
    prisma.framework.findMany({ select: { family: true, name: true, versionLabel: true } }),
    prisma.connector.findMany({
      orderBy: { name: "asc" },
      include: {
        framework: { select: { id: true, name: true, versionLabel: true } },
        checks: { orderBy: { checkedAt: "desc" }, take: 1 },
        _count: { select: { updates: { where: { reviewStatus: "NEW" } }, checks: true } },
      },
    }),
  ]);

  /**
   * The version the platform uses: for a demo framework the one DemoState is on (NIST CSF 1.1 until its update is
   * installed in Sources), otherwise the newest version of the family in the library.
   */
  const inUse = (family: string) =>
    baselines.get(family)?.version
    ?? library.filter((f) => f.family === family).map(versionOf).filter((v): v is string => !!v).sort(compareVersionLabels).at(-1)
    ?? null;

  return NextResponse.json({
    items: rows.map(({ state: _state, checks, ...c }) => {
      void _state;
      const def = CONNECTORS.find((d) => d.id === c.id);
      const family = def?.framework?.family ?? null;
      const demo = family ? baselines.get(family) : undefined;
      const lastCheck = checks[0] ?? null;
      const fingerprint = c.mechanism === "HTTP_FINGERPRINT";
      const libraryVersion = family ? inUse(family) : null;
      // The version in the publisher's last successful response (a document watch reports a file date, not a version).
      const lastGood = c.lastStatus === "ERROR" ? null : lastCheck;
      const fileDate = fingerprint ? ((lastGood?.details as { lastModified?: string } | null)?.lastModified ?? null) : null;
      const publisherVersion = lastGood?.detectedVersion ?? null;
      return {
        ...c,
        demo: demo ? { version: demo.version, newer: demo.newer, applied: demo.applied } : null,
        description: def?.description ?? "",
        fetchesContent: !!def?.fetchContent,
        mechanismLabel: MECHANISM_LABEL[c.mechanism as keyof typeof MECHANISM_LABEL] ?? c.mechanism,
        framework: c.framework ? { ...c.framework, short: shortName(c.framework.name) } : null,
        library: { version: libraryVersion, label: readableVersion(family, libraryVersion) },
        latest: {
          version: publisherVersion,
          label: readableVersion(family, publisherVersion) ?? (fileDate ? `File dated ${new Date(fileDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : null),
          newer: publisherIsNewer(publisherVersion, libraryVersion),
          // The library already holds the publisher's version and offers it as an update in Sources.
          inSources: !!demo?.newer && compareVersionLabels(comparableVersion(publisherVersion), demo.newer) === 0,
        },
        lastCheck: lastCheck && { ...lastCheck, summary: responseSummary(lastCheck, { fingerprint }) },
        openUpdates: c._count.updates,
        totalChecks: c._count.checks,
        nextCheckAt: c.lastCheckedAt ? new Date(c.lastCheckedAt.getTime() + c.pollingMinutes * 60_000) : null,
      };
    }),
  });
});
