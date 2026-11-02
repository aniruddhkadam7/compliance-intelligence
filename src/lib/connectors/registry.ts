// Connector registry + runner. Update monitoring is independent of the Excel mapping
// workflow: a detected change is recorded for review and never edits CCF mappings.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { ConnectorError } from "./http";
import { eurlexConnectors } from "./eurlex";
import { nistConnectors } from "./nist";
import type { ConnectorDefinition } from "./types";

export const CONNECTORS: ConnectorDefinition[] = [...nistConnectors, ...eurlexConnectors];
export const getDefinition = (id: string) => CONNECTORS.find((c) => c.id === id);

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Upserts static connector metadata (idempotent; preserves state and history). */
export async function ensureConnectors() {
  const frameworks = await prisma.framework.findMany({ select: { id: true, family: true, versionLabel: true } });
  const fwId = (m: ConnectorDefinition["framework"]) =>
    m ? frameworks.find((f) => f.family === m.family && (!m.version || f.versionLabel === m.version))?.id ?? null : null;
  for (const c of CONNECTORS) {
    const data = {
      name: c.name, sourceName: c.sourceName, publisher: c.publisher, mechanism: c.mechanism,
      officialUrl: c.officialUrl, endpointUrl: c.endpointUrl, frameworkId: fwId(c.framework),
    };
    await prisma.connector.upsert({ where: { id: c.id }, create: { id: c.id, pollingMinutes: c.pollingMinutes, ...data }, update: data });
  }
}

export async function runConnectorCheck(id: string, opts: { trigger: "MANUAL" | "SCHEDULED"; actor?: string }) {
  const def = getDefinition(id);
  if (!def) throw new Error(`Unknown connector ${id}`);
  const connector = await prisma.connector.findUniqueOrThrow({ where: { id }, include: { framework: true } });
  const started = Date.now();
  const checkedAt = new Date();

  try {
    const result = await def.check({
      state: (connector.state as Record<string, unknown> | null) ?? null,
      currentVersion: connector.currentVersion,
      currentHash: connector.currentHash,
      workbookVersion: connector.framework?.versionLabel ?? null,
      workbookFrameworkName: connector.framework ? shortName(connector.framework.name) : null,
    });
    const baseline = !connector.state;
    const status = result.changes.length ? "CHANGED" : baseline ? "BASELINE" : "OK";

    await prisma.$transaction(async (tx) => {
      await tx.connectorCheck.create({
        data: {
          connectorId: id, trigger: opts.trigger, status, httpStatus: result.httpStatus, durationMs: Date.now() - started, contentHash: result.contentHash,
          detectedVersion: result.detectedVersion, message: result.message, details: json(result.details ?? {}), actor: opts.actor, checkedAt,
        },
      });
      for (const ch of result.changes)
        await tx.frameworkUpdate.create({
          data: {
            connectorId: id, changeType: ch.changeType, title: ch.title, summary: ch.summary, previousValue: ch.previousValue ?? null, newValue: ch.newValue ?? null,
            details: json(ch.details ?? {}), detectedAt: checkedAt,
          },
        });
      await tx.connector.update({
        where: { id },
        data: {
          lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, lastStatus: result.changes.length ? "CHANGED" : "OK", lastError: null, state: json(result.state),
          currentHash: result.contentHash,
          // The current version is only set on baseline; later versions are adopted via "sync".
          ...(baseline && { currentVersion: result.detectedVersion }),
        },
      });
      await tx.auditLog.create({ data: { actor: opts.actor ?? "scheduler", action: "CONNECTOR_CHECK", entity: "Connector", entityId: id, details: json({ status, changes: result.changes.length, trigger: opts.trigger }) } });
    });
    return { status, message: result.message, changes: result.changes.length, detectedVersion: result.detectedVersion };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.$transaction([
      prisma.connectorCheck.create({ data: { connectorId: id, trigger: opts.trigger, status: "ERROR", httpStatus: e instanceof ConnectorError ? e.httpStatus : null, durationMs: Date.now() - started, message, actor: opts.actor, checkedAt } }),
      prisma.connector.update({ where: { id }, data: { lastCheckedAt: checkedAt, lastStatus: "ERROR", lastError: message } }),
    ]);
    return { status: "ERROR", message, changes: 0, detectedVersion: null };
  }
}

/** Adopt the latest detected version as the acknowledged baseline. Mappings are untouched. */
export async function syncConnector(id: string, actor: string) {
  const last = await prisma.connectorCheck.findFirst({ where: { connectorId: id, status: { not: "ERROR" } }, orderBy: { checkedAt: "desc" } });
  if (!last) throw new Error("Run a check before synchronising.");
  const before = await prisma.connector.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.connector.update({ where: { id }, data: { currentVersion: last.detectedVersion ?? before.currentVersion, currentHash: last.contentHash, lastSuccessAt: new Date() } }),
    prisma.auditLog.create({ data: { actor, action: "CONNECTOR_SYNC", entity: "Connector", entityId: id, details: json({ from: before.currentVersion, to: last.detectedVersion }) } }),
  ]);
  return { previous: before.currentVersion, current: last.detectedVersion ?? before.currentVersion };
}

/** Connectors whose polling interval has elapsed. */
export async function dueConnectors(now = new Date()) {
  const rows = await prisma.connector.findMany({ where: { enabled: true } });
  return rows.filter((c) => !c.lastCheckedAt || now.getTime() - c.lastCheckedAt.getTime() >= c.pollingMinutes * 60_000 * 0.95);
}
