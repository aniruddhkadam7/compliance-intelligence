// Admin-released updates. An admin uploads the new official document and reviews the draft; releasing it
// makes an "Update" button appear on the document for users. Applying it publishes the draft as a new
// version (the previous version stays), proposes client-mapping changes and re-checks the publisher.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { publishIngestion } from "@/lib/ai/ingest";
import { checkForUpdates } from "./check";
import { generateProposals } from "./impact";

const json = (v: unknown) => v as Prisma.InputJsonValue;

interface Release { by: string; at: string }
type DraftDetected = { title?: string; shortTitle?: string; libraryVersion?: string; version?: string; release?: Release; checks?: { consolidated?: { date: string } }; quality?: { unverified?: number; warnings?: string[] } };

/** After any publication: client-mapping proposals and an immediate check against the publisher. */
export async function afterPublish(ingestionId: string, frameworkId: string, actor: string) {
  const proposals = await generateProposals(ingestionId, actor);
  let check: { status: string; latestVersion: string | null; message: string | null };
  try {
    const r = await checkForUpdates(frameworkId, actor);
    check = { status: r.status, latestVersion: r.latestVersion, message: r.message };
  } catch (e) {
    // A failed check is reported, never treated as up to date.
    check = { status: "CHECK_FAILED", latestVersion: null, message: e instanceof Error ? e.message : String(e) };
  }
  return { proposals: proposals.created, check };
}

/** Newest reviewed draft of a new version of this document, if any. */
export async function pendingDraft(frameworkId: string) {
  return prisma.aiIngestion.findFirst({
    where: { status: "READY", matchKind: "NEW_VERSION", matchFrameworkId: frameworkId },
    orderBy: { createdAt: "desc" },
    select: { id: true, detected: true, createdAt: true, createdBy: true, _count: { select: { sections: true } } },
  });
}

/** Admin marks a reviewed draft as ready: users then see an "Update" button on the document. */
export async function releaseDraft(ingestionId: string, actor: string, released: boolean) {
  const ing = await prisma.aiIngestion.findUniqueOrThrow({ where: { id: ingestionId }, select: { status: true, matchKind: true, detected: true } });
  if (ing.status !== "READY" || ing.matchKind !== "NEW_VERSION") throw new HttpError(409, "Only a reviewed new version can be released.");
  const d = (ing.detected ?? {}) as DraftDetected;
  if (released && d.quality?.unverified) throw new HttpError(422, `${d.quality.unverified} section(s) are not verified against the document; fix or deselect them before releasing.`);
  const detected = { ...d, release: released ? { by: actor, at: new Date().toISOString() } : undefined };
  await prisma.aiIngestion.update({ where: { id: ingestionId }, data: { detected: json(detected) } });
  await prisma.auditLog.create({ data: { actor, action: released ? "UPDATE_RELEASED" : "UPDATE_WITHDRAWN", entity: "AiIngestion", entityId: ingestionId, details: json({}) } });
}

/** A Parent Source ID for the new version: the previous one with the version appended, kept unique. */
async function newSourceId(prev: string, version: string) {
  const base = `${prev}-${version}`.replace(/[^\w.-]/g, "").slice(0, 18);
  for (let n = 0; ; n++) {
    const id = n ? `${base.slice(0, 16)}-${n}` : base;
    if (!(await prisma.framework.findUnique({ where: { sourceId: id }, select: { id: true } }))) return id;
  }
}

/** User clicks "Update": the released draft becomes the current version of the document. */
export async function applyReleasedUpdate(frameworkId: string, actor: string) {
  const draft = await pendingDraft(frameworkId);
  const d = (draft?.detected ?? {}) as DraftDetected;
  if (!draft || !d.release) throw new HttpError(409, "No update has been released for this document.");
  const prev = await prisma.framework.findUniqueOrThrow({ where: { id: frameworkId }, select: { sourceId: true, name: true } });
  const version = d.libraryVersion || d.version?.match(/\d+(?:\.\d+)*/)?.[0] || "";
  if (!version) throw new HttpError(422, "The released draft has no version; open it in the admin console and set one.");
  const consolidated = d.checks?.consolidated?.date;
  const name = consolidated ? `${prev.name} (consolidated ${consolidated})` : d.title || d.shortTitle || `${prev.name} ${version}`;
  const result = await publishIngestion(draft.id, {
    mode: "NEW_VERSION", parentSourceId: await newSourceId(prev.sourceId, version), name, versionLabel: version,
    note: `Update released by ${d.release.by} and applied by ${actor}`,
  }, actor);
  return { ...result, version, ...(await afterPublish(draft.id, result.frameworkId, actor)) };
}
