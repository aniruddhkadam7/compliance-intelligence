import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { CONNECTORS, ensureConnectors } from "@/lib/connectors/registry";
import { MECHANISM_LABEL } from "@/lib/connectors/types";
import { shortName } from "@/lib/frameworks";

export const GET = handle(async () => {
  await requireSession();
  await ensureConnectors();
  const rows = await prisma.connector.findMany({
    orderBy: { name: "asc" },
    include: {
      framework: { select: { id: true, name: true, versionLabel: true } },
      checks: { orderBy: { checkedAt: "desc" }, take: 1 },
      _count: { select: { updates: { where: { reviewStatus: "NEW" } }, checks: true } },
    },
  });
  return NextResponse.json({
    items: rows.map(({ state: _state, ...c }) => {
      void _state;
      const def = CONNECTORS.find((d) => d.id === c.id);
      return {
        ...c,
        description: def?.description ?? "",
        mechanismLabel: MECHANISM_LABEL[c.mechanism as keyof typeof MECHANISM_LABEL] ?? c.mechanism,
        framework: c.framework ? { ...c.framework, short: shortName(c.framework.name) } : null,
        lastCheck: c.checks[0] ?? null,
        openUpdates: c._count.updates,
        totalChecks: c._count.checks,
        nextCheckAt: c.lastCheckedAt ? new Date(c.lastCheckedAt.getTime() + c.pollingMinutes * 60_000) : null,
      };
    }),
  });
});
