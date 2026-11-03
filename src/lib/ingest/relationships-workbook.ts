// Source relationship files (global layer), resolved against the document library by Source Section ID.
//
//   Legacy → latest:  Legacy Source ID | Latest Source ID | Status | (Notes)
//   Cross-framework:  Source ID A | Source ID B | Relationship | (Notes)
//   ID matrix:        one column per document, each cell the related Source Section IDs (e.g. "Cross Framework
//                     Mapping": SP 800-53 | CSF 2.0 | CIS v8 | ..., or "Legacy Vs. Latest": NIST CSF 2.0 | NIST CSF 1.1).
//                     Two versions of one document make a version transition; otherwise the first column is
//                     related to every other column.
//
// A cell may hold several IDs (split / combined sections). Only supplied relationships are stored; review sheets
// with decision or status columns hold proposals, not supplied relationships, and are not imported.

import { clean, headerKey, type ParsedSheet, type ParsedWorkbook } from "./parse";
import { id, summariseSheets, type Issue, type SheetSummary } from "./ccf-workbook";
import { deriveFamily, deriveVersion, documentKey, shortName } from "@/lib/frameworks";

export type RelationshipKind = "VERSION_TRANSITION" | "CROSS_FRAMEWORK";

const ALIASES: Record<RelationshipKind, { from: string[]; to: string[]; status: string[] }> = {
  VERSION_TRANSITION: {
    from: ["legacy source id", "legacy source section id", "old source id", "previous source id", "legacy id"],
    to: ["latest source id", "latest source section id", "new source id", "current source id", "latest id"],
    status: ["status", "transition status", "change type", "transition"],
  },
  CROSS_FRAMEWORK: {
    from: ["source id a", "from source id", "source section id a", "source id 1"],
    to: ["source id b", "to source id", "source section id b", "source id 2"],
    status: ["relationship", "relationship type", "mapping type"],
  },
};
const NOTE = ["notes", "note", "comment", "comments", "rationale"];

export { TRANSITION_STATUSES } from "./relationship-statuses";
function normaliseStatus(kind: RelationshipKind, v: string | null): string {
  const t = (v ?? "").trim();
  if (kind === "CROSS_FRAMEWORK") return t || "RELATED";
  const u = t.toUpperCase();
  if (/RETIRE|REMOV|DELET/.test(u)) return "REMOVED";
  if (/ADD|NEW/.test(u)) return "ADDED";
  if (/SPLIT/.test(u)) return "SPLIT";
  if (/COMBIN|MERG|CONSOLID/.test(u)) return "COMBINED";
  if (/UNCHANG|SAME|NO CHANGE/.test(u)) return "UNCHANGED";
  if (/MODIF|CHANG|REVIS|UPDAT/.test(u)) return "MODIFIED";
  return u || "MODIFIED";
}

function column(sheet: ParsedSheet, aliases: string[]) {
  const keys = new Map(sheet.headers.map((h) => [headerKey(h), h]));
  return aliases.map((a) => keys.get(a)).find(Boolean) ?? null;
}

export interface RelationshipRow {
  id: string; kind: RelationshipKind; fromSourceId: string | null; toSourceId: string | null;
  fromCitationId: string | null; toCitationId: string | null; status: string; note: string | null;
  raw: Record<string, string | null>; sourceSheet: string; sourceRow: number;
}

export function hasRelationships(wb: ParsedWorkbook) {
  return wb.sheetNames.some((n) => {
    const sh = wb.sheets.get(n)!;
    return (Object.keys(ALIASES) as RelationshipKind[]).some((k) => column(sh, ALIASES[k].from) && column(sh, ALIASES[k].to));
  });
}

const SERIAL = /^(sl\.?\s*no\.?|s\.?\s*no\.?|#|no\.?|row|serial( no\.?)?)$/i;
const ID_LIST = /^\d+(\s*[:;,/]\s*\d+|\s+\d+)*$/;
const splitIds = (cell: string | null) => (cell ?? "").split(/[\s,;/:]+/).filter((t) => /^\d+$/.test(t));

/** Columns of a sheet that holds only Source Section ID lists (plus an optional serial number), or null. */
function idMatrixColumns(sheet: ParsedSheet) {
  const cols = sheet.headers.filter((h) => !SERIAL.test(h.trim()));
  if (cols.length < 2 || sheet.rows.length < 3) return null;
  for (const h of cols) {
    const vals = sheet.rows.map((r) => clean(r.values[h])).filter((v): v is string => !!v);
    if (vals.length && vals.filter((v) => ID_LIST.test(v)).length / vals.length < 0.9) return null;
  }
  const withData = cols.filter((h) => sheet.rows.some((r) => clean(r.values[h])));
  return withData.length >= 2 ? withData : null;
}

const versionNumber = (v: string | null) => (v ?? "").split(/\D+/).filter(Boolean).map(Number);
const older = (a: string | null, b: string | null) => {
  const x = versionNumber(a), y = versionNumber(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

/** Source Section ID numbering: ID -> obligation id, and ID -> document name. */
export interface Numbering { lookup: Map<string, string>; doc: Map<string, string> }

/**
 * sectionLookup: Source Section ID -> obligation id. sectionDoc (optional): Source Section ID -> document name, used
 * to tell a version transition (two versions of one document) from a cross-framework mapping in an ID matrix.
 * previous (optional): the library's numbering before this file renumbered it. A matrix column whose header names
 * a document but whose IDs belong to another in the file's numbering is read in the previous numbering when that
 * matches the header (a sheet left on the old numbering), and skipped otherwise.
 */
export function normaliseRelationships(wb: ParsedWorkbook, sectionLookup: Map<string, string>, sectionDoc: Map<string, string> = new Map(), previous?: Numbering) {
  const issues: Issue[] = [];
  const rows: RelationshipRow[] = [];
  const sheets: SheetSummary[] = summariseSheets(wb).map((s) => ({ ...s, role: "UNRECOGNISED" }));
  if (sectionLookup.size === 0)
    issues.push({ severity: "ERROR", code: "LIBRARY_EMPTY", message: "The document library is empty. Import the library before relationship files." });

  /** An ID matrix sheet: a version transition between two versions of one document, else cross-framework links. */
  const known = new Set([...sectionDoc.values(), ...(previous?.doc.values() ?? [])].map(documentKey));
  function readMatrix(sheet: ParsedSheet, all: string[]) {
    const docOf = (h: string, doc: Map<string, string>) => {
      const n = new Map<string, number>();
      for (const r of sheet.rows) for (const sid of splitIds(clean(r.values[h]))) { const d = doc.get(sid); if (d) n.set(d, (n.get(d) ?? 0) + 1); }
      return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    // Each column is read in the numbering that matches the document its header names.
    const current: Numbering = { lookup: sectionLookup, doc: sectionDoc };
    const numbering = new Map<string, Numbering>();
    const docByCol = new Map<string, string>();
    for (const h of all) {
      const named = known.has(documentKey(h)) ? documentKey(h) : null;
      const inFile = docOf(h, sectionDoc);
      if (!named || (inFile && documentKey(inFile) === named)) { numbering.set(h, current); docByCol.set(h, inFile ?? h); continue; }
      const inPrevious = previous ? docOf(h, previous.doc) : null;
      if (previous && inPrevious && documentKey(inPrevious) === named) {
        numbering.set(h, previous);
        docByCol.set(h, inPrevious);
        issues.push({ severity: "WARNING", code: "RELATIONSHIP_MATRIX", sheet: sheet.name, message: `Column “${h}” uses the library's previous Source IDs (its IDs name ${shortName(inPrevious)}, as its header does); read in that numbering.` });
      } else issues.push({ severity: "WARNING", code: "RELATIONSHIP_MATRIX", sheet: sheet.name, message: `Column “${h}” is headed as ${h} but its IDs belong to ${inFile ? shortName(inFile) : "no known document"}; the column was skipped.` });
    }
    const cols = all.filter((h) => numbering.has(h));
    if (cols.length < 2) return;
    const docs = cols.map((h) => docByCol.get(h)!);
    const summary = sheets.find((x) => x.name === sheet.name)!;
    const unknown = new Set<string>();
    const resolveIn = (h: string) => (sid: string) => { const c = numbering.get(h)!.lookup.get(sid); if (!c) unknown.add(sid); return c ?? null; };
    const transition = cols.length === 2 && deriveFamily(docs[0]) === deriveFamily(docs[1]) && deriveVersion(docs[0]) !== deriveVersion(docs[1]);
    let made = 0;
    if (transition) {
      summary.role = "VERSION_TRANSITIONS";
      const [legacyCol, latestCol] = older(deriveVersion(docs[0]), deriveVersion(docs[1])) ? cols : [cols[1], cols[0]];
      const resolveFrom = resolveIn(legacyCol), resolveTo = resolveIn(latestCol);
      const uses = new Map<string, number>();
      for (const r of sheet.rows) for (const sid of splitIds(clean(r.values[legacyCol]))) uses.set(sid, (uses.get(sid) ?? 0) + 1);
      for (const { rowNumber, values } of sheet.rows) {
        const from = splitIds(clean(values[legacyCol])), to = splitIds(clean(values[latestCol]));
        if (!from.length && !to.length) continue;
        const status = !from.length ? "ADDED" : !to.length ? "REMOVED" : from.length > 1 ? "COMBINED" : to.length > 1 || (uses.get(from[0]) ?? 0) > 1 ? "SPLIT" : "MODIFIED";
        for (const f of from.length ? from : [null])
          for (const t of to.length ? to : [null]) {
            rows.push({ id: id(), kind: "VERSION_TRANSITION", fromSourceId: f, toSourceId: t, fromCitationId: f ? resolveFrom(f) : null, toCitationId: t ? resolveTo(t) : null, status, note: null, raw: values, sourceSheet: sheet.name, sourceRow: rowNumber });
            made++;
          }
      }
      issues.push({ severity: "INFO", code: "RELATIONSHIP_MATRIX", sheet: sheet.name, message: `Read as version transitions: ${shortName(docs[cols.indexOf(legacyCol)])} → ${shortName(docs[cols.indexOf(latestCol)])}, ${made} section pairs. Rows without a stated status are marked Modified, Split or Combined from their shape.` });
    } else {
      summary.role = "CROSS_FRAMEWORK";
      const [key, ...others] = cols;
      const resolveKey = resolveIn(key);
      const seen = new Set<string>();
      for (const { rowNumber, values } of sheet.rows) {
        const from = splitIds(clean(values[key]));
        for (const col of others) {
          const resolveCol = resolveIn(col);
          for (const t of splitIds(clean(values[col])))
            for (const f of from) {
              const a = resolveKey(f), b = resolveCol(t);
              if (!a || !b || seen.has(`${a}|${b}`)) continue;
              seen.add(`${a}|${b}`);
              rows.push({ id: id(), kind: "CROSS_FRAMEWORK", fromSourceId: f, toSourceId: t, fromCitationId: a, toCitationId: b, status: "Related", note: `${sheet.name}: ${shortName(docs[0])} ↔ ${shortName(docs[cols.indexOf(col)])}`, raw: values, sourceSheet: sheet.name, sourceRow: rowNumber });
              made++;
            }
        }
      }
      issues.push({ severity: "INFO", code: "RELATIONSHIP_MATRIX", sheet: sheet.name, message: `Read as cross-framework links: ${shortName(docs[0])} against ${others.length} documents, ${made} section pairs.` });
    }
    if (unknown.size)
      issues.push({ severity: "WARNING", code: "UNKNOWN_SECTION_ID", sheet: sheet.name, message: `${unknown.size} Source Section IDs are not in the document library and were skipped (e.g. ${[...unknown].slice(0, 5).join(", ")}).` });
  }

  for (const name of wb.sheetNames) {
    const sheet = wb.sheets.get(name)!;
    const kind = (Object.keys(ALIASES) as RelationshipKind[]).find((k) => column(sheet, ALIASES[k].from) && column(sheet, ALIASES[k].to));
    if (!kind) {
      const matrix = idMatrixColumns(sheet);
      if (matrix) { readMatrix(sheet, matrix); continue; }
      issues.push({ severity: "INFO", code: "SHEET_NOT_IMPORTED", sheet: name, message: "No relationship columns recognised on this sheet." });
      continue;
    }
    const s = sheets.find((x) => x.name === name)!;
    s.role = kind === "VERSION_TRANSITION" ? "VERSION_TRANSITIONS" : "CROSS_FRAMEWORK";
    const fromCol = column(sheet, ALIASES[kind].from)!;
    const toCol = column(sheet, ALIASES[kind].to)!;
    const statusCol = column(sheet, ALIASES[kind].status);
    const noteCol = column(sheet, NOTE);
    if (!statusCol)
      issues.push({ severity: "WARNING", code: "MISSING_COLUMNS", sheet: name, message: `No status column; ${kind === "VERSION_TRANSITION" ? "transitions are marked Modified unless one side is empty" : "relationships are marked Related"}.` });

    const ids = splitIds;
    for (const { rowNumber, values } of sheet.rows) {
      const from = ids(clean(values[fromCol]));
      const to = ids(clean(values[toCol]));
      if (!from.length && !to.length) continue;
      const stated = statusCol ? clean(values[statusCol]) : null;
      const status = normaliseStatus(kind, stated ?? (from.length && !to.length ? "REMOVED" : !from.length && to.length ? "ADDED" : null));
      const resolve = (sid: string) => {
        const c = sectionLookup.get(sid);
        if (!c) issues.push({ severity: "WARNING", code: "UNKNOWN_SECTION_ID", sheet: name, row: rowNumber, message: `Source Section ID ${sid} is not in the document library.` });
        return c ?? null;
      };
      // One stored relationship per from/to pair (split and combined rows expand to several pairs).
      const fromList = from.length ? from : [null];
      const toList = to.length ? to : [null];
      for (const f of fromList)
        for (const t of toList)
          rows.push({
            id: id(), kind, fromSourceId: f, toSourceId: t, fromCitationId: f ? resolve(f) : null, toCitationId: t ? resolve(t) : null,
            status, note: noteCol ? clean(values[noteCol]) : null, raw: values, sourceSheet: name, sourceRow: rowNumber,
          });
    }
  }
  if (!rows.length && !issues.some((i) => i.severity === "ERROR"))
    issues.push({ severity: "ERROR", code: "NO_ROWS", message: "No relationship rows found. Expected columns such as “Legacy Source ID” and “Latest Source ID”, or “Source ID A” and “Source ID B”." });
  const counts: Record<string, number> = {
    versionTransitions: rows.filter((r) => r.kind === "VERSION_TRANSITION").length,
    crossFramework: rows.filter((r) => r.kind === "CROSS_FRAMEWORK").length,
  };
  return { rows, issues, sheets, counts };
}

