import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseWorkbook } from "./parse";
import { normaliseCcfWorkbook, type NormaliseResult } from "./ccf-workbook";
import { isSourceIdWorkbook, normaliseSourceIdWorkbook } from "./source-id-workbook";
import type { ParsedWorkbook } from "./parse";

/** Picks the normaliser by workbook structure: source-ID mapping or the legacy CCF workbook. */
export function normaliseWorkbook(wb: ParsedWorkbook): NormaliseResult {
  return isSourceIdWorkbook(wb) ? normaliseSourceIdWorkbook(wb) : normaliseCcfWorkbook(wb);
}

export const sha256 = (buf: Buffer | ArrayBuffer) =>
  createHash("sha256").update(Buffer.from(buf as ArrayBuffer)).digest("hex");

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export interface ImportOutcome {
  jobId: string;
  status: "COMPLETED" | "FAILED";
  result: NormaliseResult;
}

/** Analyse a workbook without writing reference data. Records a PREVIEWED job. */
export async function previewCcfWorkbook(db: PrismaClient, file: { name: string; buffer: Buffer }, actor: string) {
  const result = normaliseWorkbook(parseWorkbook(file.buffer));
  const job = await db.importJob.create({
    data: {
      kind: "CCF_WORKBOOK", fileName: file.name, fileSize: file.buffer.length, fileHash: sha256(file.buffer),
      status: "PREVIEWED", sheets: json(result.sheets), counts: json(result.counts), actor,
      issues: { createMany: { data: result.issues.map((i) => ({ ...i })) } },
    },
  });
  return { jobId: job.id, result };
}

/**
 * Replace all workbook-derived reference data in one transaction.
 * Connector state, update history and audit logs are untouched.
 */
export async function importCcfWorkbook(
  db: PrismaClient,
  file: { name: string; buffer: Buffer },
  actor: string,
  opts: { previewJobId?: string } = {},
): Promise<ImportOutcome> {
  const fileHash = sha256(file.buffer);
  if (opts.previewJobId) {
    const prev = await db.importJob.findUnique({ where: { id: opts.previewJobId } });
    if (!prev || prev.fileHash !== fileHash) throw new Error("Uploaded file does not match the previewed file.");
  }
  const result = normaliseWorkbook(parseWorkbook(file.buffer));
  const blocking = result.issues.filter((i) => i.severity === "ERROR");

  const job = opts.previewJobId
    ? await db.importJob.update({ where: { id: opts.previewJobId }, data: { sheets: json(result.sheets), counts: json(result.counts) } })
    : await db.importJob.create({
        data: {
          kind: "CCF_WORKBOOK", fileName: file.name, fileSize: file.buffer.length, fileHash, status: "PREVIEWED",
          sheets: json(result.sheets), counts: json(result.counts), actor,
          issues: { createMany: { data: result.issues.map((i) => ({ ...i })) } },
        },
      });

  if (blocking.length) {
    await db.importJob.update({ where: { id: job.id }, data: { status: "FAILED", completedAt: new Date() } });
    await db.auditLog.create({ data: { actor, action: "IMPORT_REJECTED", entity: "ImportJob", entityId: job.id, details: json({ errors: blocking.length }) } });
    return { jobId: job.id, status: "FAILED", result };
  }

  const ds = result.dataset;
  const jobId = job.id;
  await db.$transaction(
    async (tx) => {
      // Children first; Framework deletion cascades to citations.
      await tx.controlObligation.deleteMany();
      await tx.testProcedureObligation.deleteMany();
      await tx.unmappedRequirementReview.deleteMany();
      await tx.controlFrameworkReference.deleteMany();
      await tx.evidenceRequirement.deleteMany();
      await tx.testProcedure.deleteMany();
      await tx.controlRequirementMapping.deleteMany();
      await tx.requirementCitation.deleteMany();
      await tx.citation.deleteMany();
      await tx.ccfControl.deleteMany();
      await tx.integratedRequirement.deleteMany();
      // Frameworks are upserted (connectors reference them by id).
      const existing = new Map((await tx.framework.findMany({ select: { id: true, sourceId: true } })).map((f) => [f.sourceId, f.id]));
      const idMap = new Map<string, string>();
      for (const f of ds.frameworks) {
        const { id: newId, raw, ...rest } = f;
        const keepId = existing.get(f.sourceId) ?? newId;
        idMap.set(newId, keepId);
        await tx.framework.upsert({
          where: { sourceId: f.sourceId },
          create: { id: keepId, ...rest, raw: json(raw), importJobId: jobId },
          update: { ...rest, raw: json(raw), importJobId: jobId },
        });
      }
      const keep = new Set(ds.frameworks.map((f) => f.sourceId));
      await tx.framework.deleteMany({ where: { sourceId: { notIn: [...keep] } } });

      await chunked(ds.requirements, 500, (b) =>
        tx.integratedRequirement.createMany({ data: b.map((r) => ({ ...r, raw: json(r.raw), importJobId: jobId })) }));
      await chunked(ds.citations, 500, (b) =>
        tx.citation.createMany({ data: b.map((c) => ({ ...c, frameworkId: idMap.get(c.frameworkId)!, raw: json(c.raw), importJobId: jobId })) }));
      await chunked(ds.requirementCitations, 1000, (b) => tx.requirementCitation.createMany({ data: b }));
      await chunked(ds.controls, 200, (b) =>
        tx.ccfControl.createMany({
          data: b.map((c) => ({ ...c, raw: json(c.raw), workingRaw: c.workingRaw ? json(c.workingRaw) : undefined, importJobId: jobId })) as Prisma.CcfControlCreateManyInput[],
        }));
      await chunked(ds.mappings, 1000, (b) => tx.controlRequirementMapping.createMany({ data: b }));
      await chunked(ds.testProcedures, 500, (b) => tx.testProcedure.createMany({ data: b.map((t) => ({ ...t, procedureId: t.procedureId ?? null })) }));
      await chunked(ds.procedureLinks, 1000, (b) => tx.testProcedureObligation.createMany({ data: b }));
      await chunked(ds.controlObligations, 1000, (b) => tx.controlObligation.createMany({ data: b }));
      await chunked(ds.evidence, 500, (b) => tx.evidenceRequirement.createMany({ data: b }));
      await chunked(ds.frameworkReferences, 1000, (b) => tx.controlFrameworkReference.createMany({ data: b }));
      await chunked(ds.reviews, 500, (b) =>
        tx.unmappedRequirementReview.createMany({ data: b.map((r) => ({ ...r, raw: json(r.raw), importJobId: jobId })) }));

      await tx.importJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date(), counts: json(result.counts) } });
      await tx.auditLog.create({
        data: { actor, action: "IMPORT_COMPLETED", entity: "ImportJob", entityId: jobId, details: json({ fileName: file.name, fileHash, counts: result.counts }) },
      });
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  return { jobId, status: "COMPLETED", result };
}
