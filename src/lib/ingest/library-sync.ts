// Document library sync: brings the library in line with a workbook's "Citation Sources", matching documents by
// identity (family and version) rather than by Source ID, because workbooks can renumber Source IDs.
//
// A document whose number changed keeps its record, and with it client mappings, relationships, version history and
// update checks: its Source ID and its sections' Source Section IDs are re-keyed to the file's numbering (sections
// matched by name, then by identifier) before the usual upsert. Nothing is deleted.

import { Prisma, type PrismaClient } from "@prisma/client";
import { documentKey, shortName } from "@/lib/frameworks";
import { parseHeading } from "@/lib/sources/headings";
import { idKey } from "@/lib/sources/relations";
import type { Issue, NormalisedDataset } from "./ccf-workbook";

type Db = Pick<PrismaClient, "framework" | "citation">;
type FileDoc = NormalisedDataset["frameworks"][number];

export interface LibraryPlan {
  /** Existing documents that carry a different Source ID in the file. */
  renumbered: { frameworkId: string; name: string; from: string; to: string; sections: number; matched: number }[];
  /** Existing documents whose Source ID the file gives to a different document, with no match in the file. */
  displaced: { frameworkId: string; name: string; from: string; to: string }[];
  /** Documents that keep their Source ID but whose section numbers the file gives to another document. */
  resectioned: { frameworkId: string; name: string; sections: number; matched: number }[];
  /** Documents in the file that are not in the library yet. */
  added: string[];
  /** Existing section (citation id) -> its Source Section ID after the sync. */
  rekey: Map<string, string>;
  /** Every Source Section ID in the file -> the obligation id it will have after the sync. */
  lookup: Map<string, string>;
  /** Every Source Section ID in the file -> its document name. */
  sectionDoc: Map<string, string>;
  issues: Issue[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const identifier = (name: string) => idKey(parseHeading(name).identifier ?? "");

export async function planLibrary(db: Db, ds: NormalisedDataset): Promise<LibraryPlan> {
  const app = await db.framework.findMany({ select: { id: true, sourceId: true, name: true } });
  const appBySid = new Map(app.map((f) => [f.sourceId, f]));
  const appByKey = new Map<string, (typeof app)[number]>();
  for (const f of app) if (!appByKey.has(documentKey(f.name))) appByKey.set(documentKey(f.name), f);
  const fileSections = new Map<string, NormalisedDataset["citations"]>();
  for (const c of ds.citations) fileSections.set(c.frameworkId, [...(fileSections.get(c.frameworkId) ?? []), c]);

  const plan: LibraryPlan = { renumbered: [], displaced: [], resectioned: [], added: [], rekey: new Map(), lookup: new Map(), sectionDoc: new Map(), issues: [] };
  const target = new Map<string, FileDoc>(); // existing framework id -> file document it becomes
  for (const f of ds.frameworks) {
    const same = appBySid.get(f.sourceId);
    if (same && documentKey(same.name) === documentKey(f.name)) { target.set(same.id, f); continue; }
    const m = appByKey.get(documentKey(f.name));
    if (m && !target.has(m.id)) target.set(m.id, f);
    else plan.added.push(f.name);
  }

  const claimed = new Set(ds.frameworks.map((f) => f.sourceId));
  const sections = await db.citation.findMany({ select: { id: true, frameworkId: true, sourceSectionId: true, sectionName: true } });
  // A document can keep its own number while the file gives some of its section numbers to another document
  // (e.g. sections 205xxx of SP 800-53 [204] becoming SP 800-82 [205]); its sections must move out of the way too.
  const appIdOfFileDoc = new Map([...target].map(([appId, f]) => [f.id, appId]));
  const fileOwner = new Map(ds.citations.map((c) => [c.sourceSectionId, appIdOfFileDoc.get(c.frameworkId) ?? null]));
  const crowded = new Set(sections.filter((c) => fileOwner.has(c.sourceSectionId) && fileOwner.get(c.sourceSectionId) !== c.frameworkId).map((c) => c.frameworkId));
  const moving = app.filter((a) => (target.has(a.id) && target.get(a.id)!.sourceId !== a.sourceId) || (!target.has(a.id) && claimed.has(a.sourceId)) || crowded.has(a.id));
  if (moving.length) {
    for (const a of moving) {
      const own = sections.filter((c) => c.frameworkId === a.id);
      const f = target.get(a.id);
      if (!f && !claimed.has(a.sourceId)) {
        // Not in the file and its number is free, but its section numbers are taken: keep them under marked numbers.
        for (const c of own) plan.rekey.set(c.id, `${c.sourceSectionId}-prev`);
        plan.resectioned.push({ frameworkId: a.id, name: a.name, sections: own.length, matched: 0 });
        continue;
      }
      if (!f) {
        // The file uses this number for another document and has no copy of this one: keep it under a marked number.
        plan.displaced.push({ frameworkId: a.id, name: a.name, from: a.sourceId, to: `${a.sourceId}-prev` });
        for (const c of own) plan.rekey.set(c.id, `${c.sourceSectionId}-prev`);
        continue;
      }
      const incoming = fileSections.get(f.id) ?? [];
      const byName = new Map(incoming.map((c) => [norm(c.sectionName), c.sourceSectionId]));
      const byId = new Map(incoming.filter((c) => identifier(c.sectionName)).map((c) => [identifier(c.sectionName), c.sourceSectionId]));
      const used = new Set<string>();
      let matched = 0;
      for (const c of own) {
        const sid = [byName.get(norm(c.sectionName)), byId.get(identifier(c.sectionName))].find((x) => x && !used.has(x));
        if (sid) { used.add(sid); matched++; plan.rekey.set(c.id, sid); } else plan.rekey.set(c.id, `${c.sourceSectionId}-prev`);
      }
      if (f.sourceId === a.sourceId) plan.resectioned.push({ frameworkId: a.id, name: a.name, sections: own.length, matched });
      else plan.renumbered.push({ frameworkId: a.id, name: a.name, from: a.sourceId, to: f.sourceId, sections: own.length, matched });
    }
  }

  // Where every Source Section ID in the file will point after the sync.
  const after = new Map(sections.map((c) => [plan.rekey.get(c.id) ?? c.sourceSectionId, c.id]));
  const docName = new Map(ds.frameworks.map((f) => [f.id, f.name]));
  for (const c of ds.citations) {
    plan.lookup.set(c.sourceSectionId, after.get(c.sourceSectionId) ?? c.id);
    plan.sectionDoc.set(c.sourceSectionId, docName.get(c.frameworkId) ?? c.authSource);
  }

  for (const r of plan.renumbered)
    plan.issues.push({
      severity: "WARNING", code: "SOURCE_ID_RENUMBERED",
      message: `${shortName(r.name)} is numbered ${r.to} in this file (${r.from} in the library). It is re-keyed to ${r.to}; ${r.matched} of ${r.sections} sections matched by name, and its mappings and history are kept.${r.matched < r.sections ? ` ${r.sections - r.matched} unmatched sections keep their old number with “-prev”.` : ""}`,
    });
  for (const d of plan.displaced)
    plan.issues.push({ severity: "WARNING", code: "SOURCE_ID_RENUMBERED", message: `${shortName(d.name)} (${d.from}) is not in this file and ${d.from} now names another document; it is kept as ${d.to}.` });
  for (const r of plan.resectioned)
    plan.issues.push({
      severity: "WARNING", code: "SECTIONS_RENUMBERED",
      message: `${shortName(r.name)} keeps its Source ID, but this file gives some of its section numbers to another document. Its ${r.sections} sections are re-keyed (${r.matched} matched by name to the file's numbering${r.matched < r.sections ? `, ${r.sections - r.matched} keep their old number with “-prev”` : ""}); mappings and history are kept.`,
    });
  for (const n of plan.added) plan.issues.push({ severity: "INFO", code: "DOCUMENT_ADDED", message: `${shortName(n)} is new to the document library and will be added.` });
  return plan;
}

/** Applies the re-keying (two passes through temporary keys, so swapped numbers never collide). */
export async function applyRekey(tx: Prisma.TransactionClient, plan: LibraryPlan) {
  const frameworks = [...plan.renumbered.map((r) => ({ id: r.frameworkId, to: r.to })), ...plan.displaced.map((d) => ({ id: d.frameworkId, to: d.to }))];
  const ids = [...frameworks.map((f) => f.id), ...plan.resectioned.map((r) => r.frameworkId)];
  if (!ids.length) return;
  if (frameworks.length) await tx.$executeRaw`UPDATE "Framework" SET "sourceId" = '__rekey_' || id WHERE id IN (${Prisma.join(frameworks.map((f) => f.id))})`;
  await tx.$executeRaw`UPDATE "Citation" SET "sourceSectionId" = '__rekey_' || id WHERE "frameworkId" IN (${Prisma.join(ids)})`;
  if (frameworks.length) {
    const values = Prisma.join(frameworks.map((f) => Prisma.sql`(${f.id}, ${f.to})`));
    await tx.$executeRaw`UPDATE "Framework" AS f SET "sourceId" = v.sid FROM (VALUES ${values}) AS v(id, sid) WHERE f.id = v.id`;
  }
  const pairs = [...plan.rekey];
  for (let i = 0; i < pairs.length; i += 500) {
    const values = Prisma.join(pairs.slice(i, i + 500).map(([id, sid]) => Prisma.sql`(${id}, ${sid})`));
    await tx.$executeRaw`UPDATE "Citation" AS c SET "sourceSectionId" = v.sid FROM (VALUES ${values}) AS v(id, sid) WHERE c.id = v.id`;
  }
}
