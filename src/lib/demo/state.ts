// Demonstration flow for framework updates, kept in one DemoState row so the demo can be run again and again.
//
//   Sources           four framework updates are offered (NIST CSF, CIS Controls, ISO/IEC 27001, ISO/IEC 27002).
//                     Until one is applied the platform shows only the previous version; Update installs the newer
//                     one, Reject leaves the update offered.
//   Custom controls   controls uploaded before an update keep pointing to the previous version until their mapping
//                     is approved in Change Analytics; controls uploaded after it point straight to the new version.
//   Rollback          returns to the demo-ready state: no update applied, nothing approved, no custom controls.
//
// Both versions of each framework stay in the library; which one a page shows is decided here.
import { prisma } from "@/lib/db";
import { resetData } from "@/lib/ingest/reset";
import { versionOf } from "@/lib/sources/previous-versions";
import { affectedControlNames } from "@/lib/updates/reference-impact";
import { resolveVersions } from "@/lib/demo/versions";

export type { Highlight } from "@/lib/demo/versions";

/**
 * The updates offered. NIST CSF, EU AI Act, ISO/IEC 27001 and ISO/IEC 27002 appear in Sources as "Update available" on
 * their own, as the team asked for the steady state. Only NIST CSF and EU AI Act have a monitoring connector; for the ISO
 * standards the row says the newer version comes from the Source Document Library. CIS Controls and CSA CCM need an
 * admin to release them in the Admin console first (`release: true`).
 * Publication dates are not kept here; Sources reads them from src/data/publication-dates.json.
 */
export const DEMO_UPDATES = [
  { key: "nist-csf", family: "NIST CSF", previous: "1.1", current: "2.0", release: false },
  { key: "cis-controls", family: "CIS Controls", previous: "8", current: "8.1", release: true },
  { key: "iso-27001", family: "ISO/IEC 27001", previous: "2013", current: "2022", release: false },
  { key: "iso-27002", family: "ISO/IEC 27002", previous: "2013", current: "2022", release: false },
  { key: "eu-ai-act", family: "EU AI Act", previous: "2024", current: "2026", release: false },
  { key: "csa-ccm", family: "CSA CCM", previous: "4.0", current: "4.1.1", release: true },
] as const;
export type DemoKey = (typeof DEMO_UPDATES)[number]["key"];
export const DEMO_KEYS = DEMO_UPDATES.map((u) => u.key) as [DemoKey, ...DemoKey[]];

export type UpdateStatus = "AVAILABLE" | "UPDATED" | "REJECTED";
export interface DemoState {
  updates: Partial<Record<DemoKey, { status: UpdateStatus; at: string }>>;
  /** Per update: the custom controls were uploaded after it was applied, so they map straight to the new version. */
  uploadedAfter: Partial<Record<DemoKey, boolean>>;
  /** Per update: controls whose mapping to the new version was approved in Change Analytics. */
  approved: Partial<Record<DemoKey, string[]>>;
  /** Per update: controls the reviewer rejected; they stay on the previous version until reconsidered or approved. */
  rejected?: Partial<Record<DemoKey, string[]>>;
  /** Per update that needs it: released to users by an admin. */
  released?: Partial<Record<DemoKey, boolean>>;
}

const KEY = "demo";
/** A fresh demo-ready state (a new object each time, so updates never alter the default). */
const empty = (): DemoState => ({ updates: {}, uploadedAfter: {}, approved: {}, rejected: {}, released: {} });

export async function getDemoState(): Promise<DemoState> {
  const row = await prisma.demoState.findUnique({ where: { key: KEY } });
  return { ...empty(), ...((row?.value ?? {}) as Partial<DemoState>) };
}

async function save(s: DemoState) {
  const value = JSON.parse(JSON.stringify(s));
  await prisma.demoState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export const statusOf = (s: DemoState, key: DemoKey): UpdateStatus => s.updates[key]?.status ?? "AVAILABLE";
/** Users can apply the update in Sources (after the admin's release, where one is needed). */
export const isReleased = (s: DemoState, key: DemoKey) => !DEMO_UPDATES.find((u) => u.key === key)?.release || !!s.released?.[key];

/** Admin: release updates to users (or withdraw the release while they are still offered). */
export async function releaseUpdates(keys: DemoKey[], released: boolean) {
  const s = await getDemoState();
  s.released = { ...s.released };
  for (const k of keys) if (statusOf(s, k) !== "UPDATED") s.released[k] = released;
  await save(s);
}

/** Installs the newer version of each framework. */
export async function applyUpdates(keys: DemoKey[]) {
  const s = await getDemoState();
  for (const k of keys) s.updates[k] = { status: "UPDATED", at: new Date().toISOString() };
  await save(s);
}

/** Declines an update; it stays offered (status "Update available") but is no longer selectable. */
export async function rejectUpdates(keys: DemoKey[]) {
  const s = await getDemoState();
  for (const k of keys) if (statusOf(s, k) !== "UPDATED") s.updates[k] = { status: "REJECTED", at: new Date().toISOString() };
  await save(s);
}

/** Moves the listed controls' mapping to the new version of an applied update. */
export async function approveControls(key: DemoKey, controls: string[]) {
  const s = await getDemoState();
  if (statusOf(s, key) !== "UPDATED") throw new Error("Apply the update in Sources before approving mappings.");
  s.approved[key] = [...new Set([...(s.approved[key] ?? []), ...controls])];
  s.rejected = { ...s.rejected, [key]: (s.rejected?.[key] ?? []).filter((c) => !controls.includes(c)) };
  await save(s);
}

/** Keeps the listed controls on the previous version. Not permanent: reconsider or approve them later. */
export async function rejectControls(key: DemoKey, controls: string[]) {
  const s = await getDemoState();
  if (statusOf(s, key) !== "UPDATED") throw new Error("Apply the update in Sources before reviewing mappings.");
  s.rejected = { ...s.rejected, [key]: [...new Set([...(s.rejected?.[key] ?? []), ...controls])] };
  s.approved[key] = (s.approved[key] ?? []).filter((c) => !controls.includes(c));
  await save(s);
}

/** Puts controls back to "awaiting approval": undoes an approval or a rejection. */
export async function reconsiderControls(key: DemoKey, controls: string[]) {
  const s = await getDemoState();
  if (statusOf(s, key) !== "UPDATED") throw new Error("Apply the update in Sources before reviewing mappings.");
  s.approved[key] = (s.approved[key] ?? []).filter((c) => !controls.includes(c));
  s.rejected = { ...s.rejected, [key]: (s.rejected?.[key] ?? []).filter((c) => !controls.includes(c)) };
  await save(s);
}

/** Called when the custom controls are (re)uploaded: they point to whichever version each framework is on now. */
export async function recordControlUpload() {
  const s = await getDemoState();
  s.uploadedAfter = Object.fromEntries(DEMO_KEYS.map((k) => [k, statusOf(s, k) === "UPDATED"]));
  s.approved = {};
  s.rejected = {};
  await save(s);
}

/**
 * Back to the demo-ready state: every update offered again, nothing approved, custom controls removed, and the connectors
 * that watch a demo framework back on its previous version (NIST CSF 1.1, EU AI Act 2024) with their findings cleared.
 */
export async function rollback(actor: string, role: string) {
  await resetData(prisma, ["controls"], actor, role);
  await save(empty());
  await resetDemoConnectors();
}

/** The version the platform is on for each demo framework family, and the newer version still offered (if any). */
export async function demoBaselines() {
  const [s, fws] = await Promise.all([getDemoState(), demoFrameworks()]);
  return new Map<string, { key: DemoKey; applied: boolean; version: string; frameworkId: string | null; newer: string | null }>(fws.map((u) => {
    const applied = statusOf(s, u.key) === "UPDATED";
    return [u.family, { key: u.key, applied, version: applied ? u.current : u.previous, frameworkId: applied ? u.currentId : u.previousId, newer: applied ? null : u.current }] as const;
  }));
}
export type DemoBaseline = NonNullable<ReturnType<Awaited<ReturnType<typeof demoBaselines>>["get"]>>;

/**
 * Connectors that watch a demo framework: linked back to the previous version, their findings (bell notifications and
 * "to review" items) removed, and the workbook comparison marked as done for that version so the next check does not
 * raise it again. Check history is kept; what the publisher publishes is still recorded there.
 */
export async function resetDemoConnectors() {
  const { CONNECTORS } = await import("@/lib/connectors/registry");
  const [fws, rows] = await Promise.all([demoFrameworks(), prisma.connector.findMany({ select: { id: true, state: true, lastStatus: true } })]);
  for (const c of rows) {
    const family = CONNECTORS.find((d) => d.id === c.id)?.framework?.family;
    const u = fws.find((f) => f.family === family);
    if (!u) continue;
    const state = c.state as Record<string, unknown> | null;
    await prisma.$transaction([
      prisma.frameworkUpdate.deleteMany({ where: { connectorId: c.id } }),
      prisma.connector.update({
        where: { id: c.id },
        data: {
          frameworkId: u.previousId,
          lastStatus: c.lastStatus === "CHANGED" ? "OK" : c.lastStatus,
          ...(state && "workbookCompared" in state && { state: { ...state, workbookCompared: u.previous } }),
        },
      }),
    ]);
  }
}

/** Each update with the library documents of its previous and new version. */
export async function demoFrameworks() {
  const fws = await prisma.framework.findMany({
    where: { family: { in: DEMO_UPDATES.map((u) => u.family) } },
    select: { id: true, name: true, family: true, versionLabel: true },
  });
  // versionOf falls back to the version recorded for the document when its label is empty.
  const find = (family: string, version: string) => fws.find((f) => f.family === family && (versionOf(f) ?? "").replace(/^v/i, "") === version)?.id ?? null;
  return DEMO_UPDATES.map((u) => ({ ...u, previousId: find(u.family, u.previous), currentId: find(u.family, u.current) }));
}

/** Library documents not installed yet: the new version of each update that has not been applied. */
export async function uninstalledVersions() {
  const [s, fws] = await Promise.all([getDemoState(), demoFrameworks()]);
  return fws.filter((u) => statusOf(s, u.key) !== "UPDATED" && u.currentId).map((u) => u.currentId!);
}

/**
 * Which framework version each custom control points to. `hidden` holds the documents a control must not show;
 * `highlight` marks the documents of an applied update: "pending" (previous version, approval outstanding) and
 * "updated" (new version, approved).
 */
export async function controlVersions() {
  const [s, fws] = await Promise.all([getDemoState(), demoFrameworks()]);
  const updates = await Promise.all(fws.map(async (u) => ({
    ...u,
    status: statusOf(s, u.key),
    uploadedAfter: !!s.uploadedAfter[u.key],
    approved: new Set(s.approved[u.key] ?? []),
    rejected: new Set(s.rejected?.[u.key] ?? []),
    affected: await affectedControlNames(u.key),
  })));
  const resolve = (controlName: string) => resolveVersions(updates, controlName);
  /** Documents no control can point to: the new version of an update not yet applied. */
  const hiddenEverywhere = new Set(updates.filter((u) => u.status !== "UPDATED" && u.currentId).map((u) => u.currentId!));
  return { updates, resolve, hiddenEverywhere };
}
