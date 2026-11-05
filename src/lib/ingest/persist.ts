import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseWorkbook } from "./parse";
import type { Issue, SheetSummary } from "./ccf-workbook";
import { hasLibrary, normaliseSourceIdWorkbook } from "./source-id-workbook";
import { applyRekey, planLibrary, type LibraryPlan } from "./library-sync";
import { REFERENCE_SHEET } from "@/lib/reference/mappings";
import type { NormalisedDataset } from "./ccf-workbook";
import { isClientTemplate, normaliseClientTemplate } from "./client-template";
import { normaliseRelationships, type RelationshipRow } from "./relationships-workbook";

/**
 * Three independent import paths:
 *   LIBRARY          global document library (frameworks + obligations). Upserted; never deletes, so client mappings survive.
 *   CLIENT_CONTROLS  one client's controls, test procedures and Source ID links. Replaces only that client's data.
 *                    A workbook that also carries the document library ("Citation Sources") and relationship sheets is
 *                    read in full: library synced first (documents matched by name, renumbered IDs re-keyed), then
 *                    relationships, then controls, so every Source ID resolves to the document the file means.
 *   RELATIONSHIPS    global source relationships (legacy -> latest, cross-framework). Replaces only the kinds in the file.
 */
export type ImportKind = "LIBRARY" | "CLIENT_CONTROLS" | "RELATIONSHIPS";
export const IMPORT_KINDS: ImportKind[] = ["LIBRARY", "CLIENT_CONTROLS", "RELATIONSHIPS"];
export const DEFAULT_CLIENT = "Default client";

export const sha256 = (buf: Buffer | ArrayBuffer) =>
  createHash("sha256").update(Buffer.from(buf as ArrayBuffer)).digest("hex");

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/** Source Section ID -> obligation id, for resolving client and relationship files against the library. */
async function sectionLookup(db: PrismaClient) {
  const rows = await db.citation.findMany({ select: { id: true, sourceSectionId: true } });
  return new Map(rows.map((r) => [r.sourceSectionId, r.id]));
}

export interface Analysis {
  issues: Issue[];
  sheets: SheetSummary[];
  counts: Record<string, number>;
  write: (tx: Prisma.TransactionClient, ctx: { jobId: string; actor: string }) => Promise<Record<string, unknown> | void>;
}

/** Source Section ID -> document name, for telling version transitions from cross-framework links. */
async function sectionDocs(db: PrismaClient) {
  const rows = await db.citation.findMany({ select: { sourceSectionId: true, framework: { select: { name: true } } } });
  return new Map(rows.map((r) => [r.sourceSectionId, r.framework.name]));
}

/** Library sync: re-key renumbered documents, then upsert frameworks and obligations (never deletes). */
async function writeLibrary(tx: Prisma.TransactionClient, ds: NormalisedDataset, plan: LibraryPlan, jobId: string) {
  await applyRekey(tx, plan);
  // Frameworks: upsert by Source ID (connectors reference them by id).
  const existingFw = new Map((await tx.framework.findMany({ select: { id: true, sourceId: true } })).map((f) => [f.sourceId, f.id]));
  const fwId = new Map<string, string>();
  for (const f of ds.frameworks) {
    const { id: newId, raw, ...rest } = f;
    const keepId = existingFw.get(f.sourceId) ?? newId;
    fwId.set(newId, keepId);
    await tx.framework.upsert({
      where: { sourceId: f.sourceId },
      create: { id: keepId, ...rest, raw: json(raw), importJobId: jobId },
      update: { ...rest, raw: json(raw), importJobId: jobId },
    });
  }
  // Obligations: insert new, update changed; obligations missing from the file are kept.
  const existing = new Map((await tx.citation.findMany({ select: { id: true, sourceSectionId: true, sectionName: true, sectionText: true, frameworkId: true } })).map((c) => [c.sourceSectionId, c]));
  const fresh = ds.citations.filter((c) => !existing.has(c.sourceSectionId));
  let updated = 0;
  for (const c of ds.citations) {
    const e = existing.get(c.sourceSectionId);
    const frameworkId = fwId.get(c.frameworkId)!;
    if (e && (e.sectionName !== c.sectionName || e.sectionText !== c.sectionText || e.frameworkId !== frameworkId)) {
      await tx.citation.update({ where: { id: e.id }, data: { sectionName: c.sectionName, sectionText: c.sectionText, frameworkId, authSource: c.authSource, raw: json(c.raw), importJobId: jobId } });
      updated++;
    }
  }
  await chunked(fresh, 500, (b) => tx.citation.createMany({ data: b.map((c) => ({ ...c, frameworkId: fwId.get(c.frameworkId)!, raw: json(c.raw), importJobId: jobId })) }));
  const inFile = new Set(ds.citations.map((c) => c.sourceSectionId));
  return { added: fresh.length, updated, kept: [...existing.keys()].filter((k) => !inFile.has(k)).length };
}

/** Replaces the relationship kinds present in the file. */
async function writeRelationships(tx: Prisma.TransactionClient, rows: RelationshipRow[], jobId: string) {
  const kinds = [...new Set(rows.map((x) => x.kind))];
  if (!kinds.length) return;
  await tx.sourceRelationship.deleteMany({ where: { kind: { in: kinds }, sourceSheet: { not: REFERENCE_SHEET } } }); // the built-in reference mappings are not part of any upload
  await chunked(rows, 1000, (b: RelationshipRow[]) =>
    tx.sourceRelationship.createMany({ data: b.map((x) => ({ ...x, raw: json(x.raw), importJobId: jobId })) }));
}

/** Replaces the client's controls, procedures, links and evidence. */
async function writeControls(tx: Prisma.TransactionClient, ds: NormalisedDataset, jobId: string) {
  const client = await tx.client.upsert({ where: { name: DEFAULT_CLIENT }, create: { name: DEFAULT_CLIENT }, update: {} });
  // Keep the mapping being replaced so the previous approved mapping stays traceable.
  const previous = await tx.ccfControl.findMany({
    where: { OR: [{ clientId: client.id }, { clientId: null }] },
    select: { controlName: true, inScope: true, obligations: { select: { mappingType: true, citation: { select: { sourceSectionId: true } } } } },
  });
  // The client's scope choices survive a re-import.
  const scope = new Map(previous.map((p) => [p.controlName, p.inScope]));
  await tx.importJob.update({
    where: { id: jobId },
    data: { clientId: client.id, previousMapping: json(previous.map((p) => ({ control: p.controlName, obligations: p.obligations.map((o) => o.citation.sourceSectionId) }))) },
  });
  // Replace this client's controls (cascades to procedures, links, evidence and pending proposals).
  await tx.ccfControl.deleteMany({ where: { OR: [{ clientId: client.id }, { clientId: null }] } });
  await chunked(ds.controls, 200, (b) =>
    tx.ccfControl.createMany({ data: b.map((c) => ({ ...c, inScope: scope.get(String(c.controlName)) ?? c.inScope ?? true, clientId: client.id, raw: json(c.raw), workingRaw: undefined, importJobId: jobId })) as Prisma.CcfControlCreateManyInput[] }));
  await chunked(ds.testProcedures, 500, (b) => tx.testProcedure.createMany({ data: b.map((t) => ({ ...t, procedureId: t.procedureId ?? null })) }));
  await chunked(ds.procedureLinks, 1000, (b) => tx.testProcedureObligation.createMany({ data: b }));
  await chunked(ds.controlObligations, 1000, (b) => tx.controlObligation.createMany({ data: b }));
  await chunked(ds.evidence, 500, (b) => tx.evidenceRequirement.createMany({ data: b }));
  return { client: client.name, replacedControls: previous.length };
}

/** Parses and validates a workbook for one import path; `write` applies it inside a transaction. */
export async function analyse(db: PrismaClient, kind: ImportKind, buffer: Buffer): Promise<Analysis> {
  const wb = parseWorkbook(buffer);

  if (kind === "RELATIONSHIPS") {
    const r = normaliseRelationships(wb, await sectionLookup(db), await sectionDocs(db));
    return { issues: r.issues, sheets: r.sheets, counts: r.counts, write: async (tx, { jobId }) => { await writeRelationships(tx, r.rows, jobId); } };
  }

  if (kind === "LIBRARY") {
    const r = normaliseSourceIdWorkbook(wb, "library");
    const plan = await planLibrary(db, r.dataset);
    return {
      issues: [...r.issues, ...plan.issues], sheets: r.sheets,
      counts: { ...r.counts, documentsRenumbered: plan.renumbered.length + plan.displaced.length, documentsAdded: plan.added.length },
      write: (tx, { jobId }) => writeLibrary(tx, r.dataset, plan, jobId),
    };
  }

  // CLIENT_CONTROLS: the simple client template, or the detailed control workbook layout.
  if (isClientTemplate(wb)) {
    const r = normaliseClientTemplate(wb, await sectionLookup(db));
    return { issues: r.issues, sheets: r.sheets, counts: r.counts, write: (tx, { jobId }) => writeControls(tx, r.dataset, jobId) };
  }
  if (!hasLibrary(wb)) {
    const r = normaliseSourceIdWorkbook(wb, "controls", await sectionLookup(db));
    return { issues: r.issues, sheets: r.sheets, counts: r.counts, write: (tx, { jobId }) => writeControls(tx, r.dataset, jobId) };
  }

  // A full workbook: library, relationships and controls, each Source ID resolved through the file's own library.
  const lib = normaliseSourceIdWorkbook(wb, "library");
  const libOk = !lib.issues.some((i) => i.severity === "ERROR");
  const plan = libOk ? await planLibrary(db, lib.dataset) : null;
  const lookup = plan?.lookup ?? (await sectionLookup(db));
  const rel = plan
    ? normaliseRelationships(wb, lookup, plan.sectionDoc, { lookup: await sectionLookup(db), doc: await sectionDocs(db) })
    : normaliseRelationships(wb, lookup, await sectionDocs(db));
  const ctl = normaliseSourceIdWorkbook(wb, "controls", lookup);
  const roleOf = (name: string) =>
    [ctl.sheets, lib.sheets, rel.sheets].map((list) => list.find((x) => x.name === name)?.role).find((r) => r && r !== "UNRECOGNISED") ?? "UNRECOGNISED";
  const quiet = new Set(["SHEET_NOT_IMPORTED", "NO_ROWS", "LIBRARY_EMPTY"]);
  const recognised = new Set(ctl.sheets.map((s) => s.name).filter((n) => roleOf(n) !== "UNRECOGNISED"));
  return {
    issues: [
      ...(plan?.issues ?? lib.issues.filter((i) => i.severity === "ERROR").map((i) => ({ ...i, severity: "WARNING" as const, message: `Document library not updated: ${i.message}` }))),
      ...ctl.issues.filter((i) => !(i.code === "SHEET_NOT_IMPORTED" && recognised.has(i.sheet ?? ""))),
      ...rel.issues.filter((i) => !quiet.has(i.code)),
    ],
    sheets: ctl.sheets.map((s) => ({ ...s, role: roleOf(s.name) as typeof s.role })),
    counts: {
      ...ctl.counts,
      ...(plan ? { libraryDocuments: lib.counts.frameworks ?? 0, librarySections: lib.counts.citations ?? 0, documentsRenumbered: plan.renumbered.length + plan.displaced.length, documentsAdded: plan.added.length } : {}),
      ...(rel.rows.length ? { crossFramework: rel.counts.crossFramework, versionTransitions: rel.counts.versionTransitions } : {}),
    },
    write: async (tx, { jobId }) => {
      const library = plan ? await writeLibrary(tx, lib.dataset, plan, jobId) : undefined;
      await writeRelationships(tx, rel.rows, jobId);
      const controls = await writeControls(tx, ctl.dataset, jobId);
      return { ...controls, ...(library && { sectionsAdded: library.added, sectionsUpdated: library.updated }) };
    },
  };
}

/** Analyse a workbook without writing data. Records a PREVIEWED job. */
export async function previewImport(db: PrismaClient, kind: ImportKind, file: { name: string; buffer: Buffer }, actor: string) {
  const a = await analyse(db, kind, file.buffer);
  const job = await db.importJob.create({
    data: {
      kind, fileName: file.name, fileSize: file.buffer.length, fileHash: sha256(file.buffer),
      status: "PREVIEWED", sheets: json(a.sheets), counts: json(a.counts), actor,
      issues: { createMany: { data: a.issues.map((i) => ({ ...i })) } },
    },
  });
  return { jobId: job.id, kind, sheets: a.sheets, counts: a.counts, issues: a.issues };
}

export interface ImportOutcome {
  jobId: string;
  status: "COMPLETED" | "FAILED";
  counts: Record<string, number>;
  issues: Issue[];
}

/** Write a previewed (or, from the CLI, a fresh) import in one transaction. */
export async function confirmImport(
  db: PrismaClient,
  kind: ImportKind,
  file: { name: string; buffer: Buffer },
  actor: string,
  opts: { previewJobId?: string } = {},
): Promise<ImportOutcome> {
  const fileHash = sha256(file.buffer);
  const a = await analyse(db, kind, file.buffer);
  const job = opts.previewJobId
    ? await db.importJob.update({ where: { id: opts.previewJobId }, data: { sheets: json(a.sheets), counts: json(a.counts) } })
    : await db.importJob.create({
        data: {
          kind, fileName: file.name, fileSize: file.buffer.length, fileHash, status: "PREVIEWED",
          sheets: json(a.sheets), counts: json(a.counts), actor, issues: { createMany: { data: a.issues.map((i) => ({ ...i })) } },
        },
      });

  const blocking = a.issues.filter((i) => i.severity === "ERROR");
  if (blocking.length) {
    await db.importJob.update({ where: { id: job.id }, data: { status: "FAILED", completedAt: new Date() } });
    await db.auditLog.create({ data: { actor, action: "IMPORT_REJECTED", entity: "ImportJob", entityId: job.id, details: json({ kind, errors: blocking.length }) } });
    return { jobId: job.id, status: "FAILED", counts: a.counts, issues: a.issues };
  }

  await db.$transaction(
    async (tx) => {
      const extra = (await a.write(tx, { jobId: job.id, actor })) ?? {};
      const counts = { ...a.counts, ...extra };
      await tx.importJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), counts: json(counts) } });
      await tx.auditLog.create({ data: { actor, action: "IMPORT_COMPLETED", entity: "ImportJob", entityId: job.id, details: json({ kind, fileName: file.name, fileHash, counts }) } });
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
  return { jobId: job.id, status: "COMPLETED", counts: a.counts, issues: a.issues };
}
