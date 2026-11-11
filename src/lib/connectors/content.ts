// Full updates from connectors. When the publisher provides a framework as data, the connector downloads the newest
// version and prepares it as an update: the same draft an Admin Console upload creates, released at once because it
// comes straight from the official source. Users then see "Update available" in Sources and install it with Update.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { startStructuredIngestion } from "@/lib/ai/ingest";
import { demoBaselines } from "@/lib/demo/state";
import { getDefinition } from "./registry";

import { compareVersionLabels } from "./status";

export { compareVersionLabels };
const json = (v: unknown) => v as Prisma.InputJsonValue;

export type ContentImport =
  | { status: "UP_TO_DATE"; version: string }
  | { status: "IN_SOURCES"; version: string }
  | { status: "ALREADY_PREPARED"; version: string; draftId: string }
  | { status: "PREPARED"; version: string; draftId: string; sections: number };

/** Downloads the newest version a connector sees and prepares it as an update, unless the library already has it. */
export async function importConnectorContent(connectorId: string, actor: string): Promise<ContentImport> {
  const def = getDefinition(connectorId);
  if (!def) throw new HttpError(404, "Connector not found.");
  if (!def.fetchContent || !def.framework) throw new HttpError(409, "This source does not publish the framework as data; upload the new version in the Admin Console.");
  const connector = await prisma.connector.findUniqueOrThrow({ where: { id: connectorId }, select: { state: true } });

  // The version in use is the newest version of the framework in the library.
  const versions = await prisma.framework.findMany({ where: { family: def.framework.family }, select: { id: true, versionLabel: true } });
  const current = versions.sort((a, b) => compareVersionLabels(a.versionLabel, b.versionLabel)).at(-1);
  if (!current) throw new HttpError(409, `${def.framework.family} is not in the library yet.`);

  const content = await def.fetchContent({ state: (connector.state as Record<string, unknown> | null) ?? null });
  // Demo framework still on its previous version: the newer version is already offered as an update in Sources.
  const demo = (await demoBaselines()).get(def.framework.family);
  if (demo?.newer && compareVersionLabels(content.version, demo.newer) === 0) return { status: "IN_SOURCES", version: content.version };
  if (versions.some((v) => compareVersionLabels(v.versionLabel, content.version) === 0) || compareVersionLabels(content.version, current.versionLabel) <= 0)
    return { status: "UP_TO_DATE", version: content.version };

  const drafts = await prisma.aiIngestion.findMany({ where: { status: "READY", matchKind: "NEW_VERSION", matchFrameworkId: current.id }, select: { id: true, detected: true } });
  const existing = drafts.find((d) => compareVersionLabels((d.detected as { libraryVersion?: string } | null)?.libraryVersion, content.version) === 0
    && (d.detected as { source?: { connector?: string } } | null)?.source?.connector === def.name);
  if (existing) return { status: "ALREADY_PREPARED", version: content.version, draftId: existing.id };

  const draftId = await startStructuredIngestion(content, current.id, actor, { name: def.name, release: { by: `${def.name} connector`, at: new Date().toISOString() } });
  await prisma.auditLog.create({ data: { actor, action: "CONNECTOR_CONTENT_IMPORTED", entity: "Connector", entityId: connectorId, details: json({ version: content.version, sections: content.sections.length, draftId }) } });
  return { status: "PREPARED", version: content.version, draftId, sections: content.sections.length };
}
