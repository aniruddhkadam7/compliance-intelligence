// The notification panel: one list of everything about framework versions that needs a person's attention, read
// from the same backend state the pages use, so the bell never disagrees with Sources or the Connector page.
//
//   Update available      a newer framework version is offered in Sources (released to users, not installed or rejected)
//   Ready to install      a new version uploaded or downloaded by a connector, released and waiting for Update
//   Connector findings    version changes, new publications and content changes a connector detected, not yet reviewed
//   Connector error       a connector's last check failed
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { CONNECTORS } from "@/lib/connectors/registry";
import { demoFrameworks, getDemoState, isReleased, statusOf } from "@/lib/demo/state";
import { pendingImports } from "./sources";
import publication from "@/data/publication-dates.json";

export type NotificationKind = "UPDATE_AVAILABLE" | "READY_TO_INSTALL" | "VERSION_CHANGE" | "NEW_PUBLICATION" | "CONTENT_CHANGE" | "NEW_INFORMATIVE_REFERENCE" | "CONNECTOR_ERROR";

export interface Notification {
  id: string;
  kind: NotificationKind;
  framework: string;
  /** Version the platform is on, and the version the notification is about (either may be unknown). */
  fromVersion: string | null;
  version: string | null;
  /** Publication date of the new version, or when the change was detected or the upload made. */
  date: string | null;
  dateLabel: "Published" | "Detected" | "Uploaded" | "Checked";
  /** What the user should do or what state it is in, e.g. "Update available", "To review", "Error". */
  status: string;
  detail: string | null;
  href: string;
}

const dates = publication.dates as Record<string, string>;

export async function listNotifications(): Promise<Notification[]> {
  const [state, demo, pending, findings, errors, fws] = await Promise.all([
    getDemoState(),
    demoFrameworks(),
    pendingImports(),
    prisma.frameworkUpdate.findMany({
      where: { reviewStatus: "NEW" }, orderBy: { detectedAt: "desc" }, take: 50,
      include: { connector: { select: { name: true, framework: { select: { name: true, versionLabel: true } } } } },
    }),
    prisma.connector.findMany({ where: { lastStatus: "ERROR", enabled: true }, select: { id: true, name: true, lastError: true, lastCheckedAt: true, framework: { select: { name: true } } } }),
    prisma.framework.findMany({ select: { id: true, name: true, sourceId: true, versionLabel: true } }),
  ]);
  const fw = (id: string | null) => fws.find((f) => f.id === id);
  const watchedBy = (family: string) => CONNECTORS.find((c) => c.framework?.family === family && c.mechanism !== "HTTP_FINGERPRINT")?.name ?? null;
  const out: Notification[] = [];

  for (const u of demo) {
    if (statusOf(state, u.key) !== "AVAILABLE" || !isReleased(state, u.key) || !u.currentId) continue;
    const by = watchedBy(u.family);
    out.push({
      id: `update:${u.key}`, kind: "UPDATE_AVAILABLE", framework: u.family, fromVersion: u.previous, version: u.current,
      date: dates[fw(u.currentId)?.sourceId ?? ""] ?? null, dateLabel: "Published", status: "Update available",
      detail: by ? `Detected by ${by}` : "New version in the Source Document Library", href: "/sources",
    });
  }
  for (const [frameworkId, p] of pending) {
    if (!p.released) continue;
    const f = fw(frameworkId);
    out.push({
      id: `import:${p.id}`, kind: "READY_TO_INSTALL", framework: f ? shortName(f.name) : "Framework", fromVersion: f?.versionLabel ?? null, version: p.version,
      date: p.uploadedAt, dateLabel: "Uploaded", status: "Ready to install", detail: p.fromConnector ? `Downloaded by ${p.fromConnector}` : "Released by an admin", href: "/sources",
    });
  }
  for (const u of findings) {
    const f = u.connector.framework;
    out.push({
      id: `finding:${u.id}`, kind: u.changeType as NotificationKind, framework: f ? shortName(f.name) : u.connector.name, fromVersion: u.previousValue, version: u.newValue,
      date: u.detectedAt.toISOString(), dateLabel: "Detected", status: "To review", detail: u.title, href: `/updates?update=${u.id}`,
    });
  }
  for (const c of errors) {
    out.push({
      id: `error:${c.id}`, kind: "CONNECTOR_ERROR", framework: c.framework ? shortName(c.framework.name) : c.name, fromVersion: null, version: null,
      date: c.lastCheckedAt?.toISOString() ?? null, dateLabel: "Checked", status: "Error", detail: `${c.name}: ${c.lastError ?? "check failed"}`, href: "/updates",
    });
  }
  return out;
}
