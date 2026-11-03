import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseWorkbook } from "./parse";
import type { Issue, SheetSummary } from "./ccf-workbook";
import { normaliseSourceIdWorkbook } from "./source-id-workbook";
import { isClientTemplate, normaliseClientTemplate } from "./client-template";
import { normaliseRelationships, type RelationshipRow } from "./relationships-workbook";

/**
 * Three independent import paths:
 *   LIBRARY          global document library (frameworks + obligations). Upserted; never deletes, so client mappings survive.
 *   CLIENT_CONTROLS  one client's controls, test procedures and Source ID links. Replaces only that client's data.
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

interface Analysis {
  issues: Issue[];
  sheets: SheetSummary[];
  counts: Record<string, number>;
  write: (tx: Prisma.TransactionClient, ctx: { jobId: string; actor: string }) => Promise<Record<string, unknown> | void>;
}

async function analyse(db: PrismaClient, kind: ImportKind, buffer: Buffer): Promise<Analysis> {
  const wb = parseWorkbook(buffer);

  if (kind === "RELATIONSHIPS") {
    const r = normaliseRelationships(wb, await sectionLookup(db));
    return {
      issues: r.issues, sheets: r.sheets, counts: r.counts,
      write: async (tx, { jobId }) => {
        const kinds = [...new Set(r.rows.map((x) => x.kind))];
        await tx.sourceRelationship.deleteMany({ where: { kind: { in: kinds } } });
        await chunked(r.rows, 1000, (b: RelationshipRow[]) =>
          tx.sourceRelationship.createMany({ data: b.map((x) => ({ ...x, raw: json(x.raw), importJobId: jobId })) }));
      },
    };
  }

  if (kind === "LIBRARY") {
    const r = normaliseSourceIdWorkbook(wb, "library");
    const ds = r.dataset;
    return {
      issues: r.issues, sheets: r.sheets, counts: r.counts,
      write: async (tx, { jobId }) => {
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
      },
    };
  }

  // CLIENT_CONTROLS
  // The simple client template, or the detailed control workbook layout.
  const r = isClientTemplate(wb) ? normaliseClientTemplate(wb, await sectionLookup(db)) : normaliseSourceIdWorkbook(wb, "controls", await sectionLookup(db));
  const ds = r.dataset;
  return {
    issues: r.issues, sheets: r.sheets, counts: r.counts,
    write: async (tx, { jobId }) => {
      const client = await tx.client.upsert({ where: { name: DEFAULT_CLIENT }, create: { name: DEFAULT_CLIENT }, update: {} });
      // Keep the mapping being replaced so the previous approved mapping stays traceable.
      const previous = await tx.ccfControl.findMany({
        where: { OR: [{ clientId: client.id }, { clientId: null }] },
        select: { controlName: true, obligations: { select: { mappingType: true, citation: { select: { sourceSectionId: true } } } } },
      });
      await tx.importJob.update({
        where: { id: jobId },
        data: { clientId: client.id, previousMapping: json(previous.map((p) => ({ control: p.controlName, obligations: p.obligations.map((o) => o.citation.sourceSectionId) }))) },
      });
      // Replace this client's controls (cascades to procedures, links, evidence and pending proposals).
      await tx.ccfControl.deleteMany({ where: { OR: [{ clientId: client.id }, { clientId: null }] } });
      await chunked(ds.controls, 200, (b) =>
        tx.ccfControl.createMany({ data: b.map((c) => ({ ...c, clientId: client.id, raw: json(c.raw), workingRaw: undefined, importJobId: jobId })) as Prisma.CcfControlCreateManyInput[] }));
      await chunked(ds.testProcedures, 500, (b) => tx.testProcedure.createMany({ data: b.map((t) => ({ ...t, procedureId: t.procedureId ?? null })) }));
      await chunked(ds.procedureLinks, 1000, (b) => tx.testProcedureObligation.createMany({ data: b }));
      await chunked(ds.controlObligations, 1000, (b) => tx.controlObligation.createMany({ data: b }));
      await chunked(ds.evidence, 500, (b) => tx.evidenceRequirement.createMany({ data: b }));
      return { client: client.name, replacedControls: previous.length };
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
