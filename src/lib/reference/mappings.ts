// Reference cross-framework mappings: the team's "Cross-Framework Mapping (All Sources)" workbook, built into the app
// (src/data/cross-framework-mapping.json, made by scripts/build-reference-mappings.ts). This is global reference data,
// not a client upload: it loads by itself and survives client uploads, which never touch these rows.
//
// Every Source Section ID is checked against the document the workbook says it belongs to. An ID that names another
// document in this database (a library numbered differently) or is not in it at all is skipped, never mis-linked.
import { prisma } from "@/lib/db";
import { documentKey } from "@/lib/frameworks";

/** Marks the rows loaded from the built-in data; replaced as a set, left alone by every upload. */
export const REFERENCE_SHEET = "Reference: Cross-Framework Mapping (All Sources)";

interface ReferenceData { source: string; version: string; parents: Record<string, string>; sections: Record<string, number[]>; mappings: Record<string, number[]> }

export interface ReferenceLoad { loaded: number; skippedUnknown: number; skippedOtherDocument: number }

const CHUNK = 2000;
let loading: Promise<ReferenceLoad> | null = null;

async function load(data: ReferenceData): Promise<ReferenceLoad> {
  const idParent = new Map<number, string>();
  for (const [parent, ids] of Object.entries(data.sections)) for (const id of ids) idParent.set(id, parent);

  const cits = await prisma.citation.findMany({ select: { id: true, sourceSectionId: true, frameworkId: true, framework: { select: { name: true } } } });
  const bySid = new Map(cits.map((c) => [c.sourceSectionId, { id: c.id, frameworkId: c.frameworkId, doc: documentKey(c.framework.name) }]));

  const rows: { kind: string; fromSourceId: string; toSourceId: string; fromCitationId: string; toCitationId: string; status: string; note: string; raw: { version: string }; sourceSheet: string; sourceRow: number }[] = [];
  let skippedUnknown = 0, skippedOtherDocument = 0;
  const resolve = (sid: number) => {
    const c = bySid.get(String(sid));
    if (!c) return "unknown" as const;
    return c.doc === data.parents[idParent.get(sid) ?? ""] ? c : ("other" as const);
  };
  for (const [a, list] of Object.entries(data.mappings)) {
    const ra = resolve(Number(a));
    for (const b of list) {
      const rb = resolve(b);
      if (ra === "unknown" || rb === "unknown") { skippedUnknown++; continue; }
      if (ra === "other" || rb === "other") { skippedOtherDocument++; continue; }
      if (ra.frameworkId === rb.frameworkId) continue;
      rows.push({ kind: "CROSS_FRAMEWORK", fromSourceId: a, toSourceId: String(b), fromCitationId: ra.id, toCitationId: rb.id, status: "Related", note: data.source, raw: { version: data.version }, sourceSheet: REFERENCE_SHEET, sourceRow: 0 });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.sourceRelationship.deleteMany({ where: { sourceSheet: REFERENCE_SHEET } });
      for (let i = 0; i < rows.length; i += CHUNK) await tx.sourceRelationship.createMany({ data: rows.slice(i, i + CHUNK) });
    },
    { timeout: 240_000, maxWait: 20_000 },
  );
  console.log(`Reference mappings loaded: ${rows.length} (skipped: ${skippedUnknown} not in the library, ${skippedOtherDocument} numbered for another document).`);
  return { loaded: rows.length, skippedUnknown, skippedOtherDocument };
}

/** Loads the built-in mappings once, and again whenever the data file changes. Safe to call on every request. */
export async function ensureReferenceMappings() {
  const data = (await import("@/data/cross-framework-mapping.json")).default as unknown as ReferenceData;
  const have = await prisma.sourceRelationship.findFirst({ where: { sourceSheet: REFERENCE_SHEET }, select: { raw: true } });
  if ((have?.raw as { version?: string } | null)?.version === data.version) return null;
  loading ??= load(data).finally(() => { loading = null; });
  return loading;
}
