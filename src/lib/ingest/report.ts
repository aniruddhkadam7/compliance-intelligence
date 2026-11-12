// What an import did with each worksheet, built only from what the parsers actually reported (sheet roles and issues).
// Pure, so it can be tested without a database. The Data & Imports page shows this instead of a generic issue list:
// which worksheets were imported, which were only checked, which were skipped and why, and the exact columns at fault.
import type { Issue, SheetSummary } from "./ccf-workbook";

/** IMPORTED: rows are written. CHECKED: read to validate other sheets, nothing written from it. SKIPPED: not read. BLOCKED: has blocking errors. */
export type SheetStatus = "IMPORTED" | "CHECKED" | "SKIPPED" | "BLOCKED";

export interface ColumnProblem { column: string; severity: "ERROR" | "WARNING"; rows: number; message: string }

export interface SheetReport {
  name: string;
  role: string;
  roleLabel: string;
  status: SheetStatus;
  /** Why the sheet was skipped or blocked; what it was used for otherwise. */
  reason: string | null;
  headerRow: number | null;
  headers: number;
  rows: number;
  /** Required columns the parser looked for and did not find. */
  missingColumns: string[];
  /** Columns with rows that could not be read or resolved, grouped by column. */
  columnProblems: ColumnProblem[];
  errors: number;
  warnings: number;
}

export interface ImportReport {
  sheets: SheetReport[];
  summary: { worksheets: number; imported: number; checked: number; skipped: number; blocked: number; rows: number; headers: number };
  /** READY: no blocking errors, Confirm Import may run. ACTION_NEEDED: fix the workbook first. */
  outcome: "READY" | "ACTION_NEEDED";
  errors: number;
  warnings: number;
}

export const ROLE_LABEL: Record<string, string> = {
  SOURCES: "Frameworks", CITATIONS: "Document library (obligations)", REQUIREMENTS: "Mapping groups", CONTROLS: "Control register",
  CONTROLS_SELECTION: "Custom control selection", CONTROLS_WORKING: "CCF working sheet", METRICS: "Mapping count check", IR_ID_LIST: "Reference list check",
  UNMAPPED_REVIEW: "Unmapped review", UNRECOGNISED: "Not recognised", PROCEDURE_MAP: "Test procedure mapping",
  SOURCE_LIST: "Framework list", SOURCE_METADATA: "Framework details", VERSION_TRANSITIONS: "Version transitions", CROSS_FRAMEWORK: "Framework relationships",
};

/** Roles whose rows are written to the database; the rest are read only to check the others. */
const WRITTEN = new Set(["SOURCES", "CITATIONS", "REQUIREMENTS", "CONTROLS", "CONTROLS_SELECTION", "CONTROLS_WORKING", "UNMAPPED_REVIEW", "PROCEDURE_MAP", "SOURCE_METADATA", "VERSION_TRANSITIONS", "CROSS_FRAMEWORK"]);
const CHECK_ONLY: Record<string, string> = {
  METRICS: "Read to check the stated mapping counts; nothing is written from it.",
  IR_ID_LIST: "Read to check the reference list; nothing is written from it.",
  SOURCE_LIST: "Read to check the framework list against the obligations; nothing is written from it.",
};
const LIBRARY_ROLES = new Set(["CITATIONS", "SOURCE_LIST", "SOURCE_METADATA"]);
const GENERIC_SKIP = /^Worksheet is not used by the|^No relationship columns recognised/;

const headerSample = (s: SheetSummary) => {
  const h = s.headers.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return h.slice(0, 4).map((x) => `“${x.length > 30 ? `${x.slice(0, 29)}…` : x}”`).join(", ") + (h.length > 4 ? ` and ${h.length - 4} more` : "");
};

/** The specific reason a sheet the import did not read was skipped. */
function skipReason(s: SheetSummary, own: Issue[], libraryNotUpdated: string | null): string {
  if (libraryNotUpdated && LIBRARY_ROLES.has(s.role)) return libraryNotUpdated;
  // A parser that looked at the sheet and gave up says why (e.g. a relationship column whose IDs belong to another document).
  const specific = own.find((i) => i.severity !== "INFO" && !GENERIC_SKIP.test(i.message)) ?? own.find((i) => i.code === "SHEET_NOT_IMPORTED" && !GENERIC_SKIP.test(i.message));
  if (specific) return specific.message;
  if (s.role !== "UNRECOGNISED") return `Recognised as ${ROLE_LABEL[s.role]?.toLowerCase() ?? s.role}, which this import type does not use.`;
  if (s.headerRow === null) return "No header row found: the sheet is empty or has no table.";
  if (!s.rowCount) return `Header row ${s.headerRow} found but there are no data rows under it.`;
  return `Layout not recognised: the headers in row ${s.headerRow} (${headerSample(s)}) do not match any worksheet the import reads.`;
}

/**
 * Builds the per-worksheet report and returns the issues with the generic "worksheet not imported" notes replaced by
 * the specific reason, so the stored findings (Data quality, import history) say the same as the report.
 */
export function buildImportReport(sheets: SheetSummary[], issues: Issue[]): { report: ImportReport; issues: Issue[] } {
  const libraryNotUpdated = issues.find((i) => i.message.startsWith("Document library not updated"))?.message ?? null;
  const reports = sheets.map((s): SheetReport => {
    const own = issues.filter((i) => i.sheet === s.name);
    const errors = own.filter((i) => i.severity === "ERROR").length;
    const warnings = own.filter((i) => i.severity === "WARNING").length;
    const skipped = s.role === "UNRECOGNISED" || own.some((i) => i.code === "SHEET_NOT_IMPORTED") || (!!libraryNotUpdated && LIBRARY_ROLES.has(s.role));
    const byColumn = new Map<string, ColumnProblem>();
    for (const i of own) {
      if (!i.column || i.severity === "INFO") continue;
      const col = i.column.replace(/\s+/g, " ").trim();
      const p = byColumn.get(col) ?? { column: col, severity: i.severity, rows: 0, message: i.message };
      p.rows += i.row ? 1 : 0;
      if (i.severity === "ERROR") p.severity = "ERROR";
      byColumn.set(col, p);
    }
    const status: SheetStatus = errors ? "BLOCKED" : skipped ? "SKIPPED" : WRITTEN.has(s.role) ? "IMPORTED" : CHECK_ONLY[s.role] ? "CHECKED" : "SKIPPED";
    const reason = status === "BLOCKED"
      ? own.find((i) => i.severity === "ERROR")!.message
      : status === "SKIPPED" ? skipReason(s, own, libraryNotUpdated)
      : status === "CHECKED" ? CHECK_ONLY[s.role]
      : null;
    return {
      name: s.name, role: s.role, roleLabel: ROLE_LABEL[s.role] ?? s.role, status, reason, headerRow: s.headerRow, headers: s.headers.length, rows: s.rowCount,
      missingColumns: s.missingRequired, columnProblems: [...byColumn.values()], errors, warnings,
    };
  });
  const n = (st: SheetStatus) => reports.filter((r) => r.status === st).length;
  const used = reports.filter((r) => r.status === "IMPORTED" || r.status === "CHECKED");
  const errors = issues.filter((i) => i.severity === "ERROR").length;
  const reasonOf = new Map(reports.filter((r) => r.status === "SKIPPED").map((r) => [r.name, r.reason!]));
  return {
    report: {
      sheets: reports,
      summary: { worksheets: reports.length, imported: n("IMPORTED"), checked: n("CHECKED"), skipped: n("SKIPPED"), blocked: n("BLOCKED"), rows: used.reduce((t, r) => t + r.rows, 0), headers: used.reduce((t, r) => t + r.headers, 0) },
      outcome: errors ? "ACTION_NEEDED" : "READY",
      errors,
      warnings: issues.filter((i) => i.severity === "WARNING").length,
    },
    issues: issues.map((i) => (i.code === "SHEET_NOT_IMPORTED" && i.sheet && reasonOf.has(i.sheet) ? { ...i, message: reasonOf.get(i.sheet)! } : i)),
  };
}
