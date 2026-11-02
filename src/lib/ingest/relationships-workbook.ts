// Source relationship files (global layer), resolved against the document library by Source Section ID.
//
//   Legacy → latest:  Legacy Source ID | Latest Source ID | Status | (Notes)
//   Cross-framework:  Source ID A | Source ID B | Relationship | (Notes)
//
// A cell may hold several IDs (split / combined sections). Only supplied relationships are stored.

import { clean, headerKey, type ParsedSheet, type ParsedWorkbook } from "./parse";
import { id, summariseSheets, type Issue, type SheetSummary } from "./ccf-workbook";

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

export function normaliseRelationships(wb: ParsedWorkbook, sectionLookup: Map<string, string>) {
  const issues: Issue[] = [];
  const rows: RelationshipRow[] = [];
  const sheets: SheetSummary[] = summariseSheets(wb).map((s) => ({ ...s, role: "UNRECOGNISED" }));
  if (sectionLookup.size === 0)
    issues.push({ severity: "ERROR", code: "LIBRARY_EMPTY", message: "The document library is empty. Import the library before relationship files." });

  for (const name of wb.sheetNames) {
    const sheet = wb.sheets.get(name)!;
    const kind = (Object.keys(ALIASES) as RelationshipKind[]).find((k) => column(sheet, ALIASES[k].from) && column(sheet, ALIASES[k].to));
    if (!kind) {
      issues.push({ severity: "INFO", code: "SHEET_NOT_IMPORTED", sheet: name, message: "No relationship columns recognised on this sheet." });
      continue;
    }
    const s = sheets.find((x) => x.name === name)!;
    s.role = kind === "VERSION_TRANSITION" ? "SOURCE_LIST" : "PROCEDURE_MAP";
    const fromCol = column(sheet, ALIASES[kind].from)!;
    const toCol = column(sheet, ALIASES[kind].to)!;
    const statusCol = column(sheet, ALIASES[kind].status);
    const noteCol = column(sheet, NOTE);
    if (!statusCol)
      issues.push({ severity: "WARNING", code: "MISSING_COLUMNS", sheet: name, message: `No status column; ${kind === "VERSION_TRANSITION" ? "transitions are marked Modified unless one side is empty" : "relationships are marked Related"}.` });

    const ids = (cell: string | null) => (cell ?? "").split(/[\s,;/]+/).filter((t) => /^\d+$/.test(t));
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

