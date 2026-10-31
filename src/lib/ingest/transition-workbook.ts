// Version-transition workbook (e.g. NIST CSF 1.1 → 2.0 Govern examples).
// The team's file has not been supplied yet, so columns are matched by header aliases.
// Every original column is preserved in `raw`; nothing is inferred when a column is absent.

import { headerKey, type ParsedWorkbook } from "./parse";
import type { Issue, SheetSummary } from "./ccf-workbook";
import { summariseSheets } from "./ccf-workbook";

export const TRANSITION_FIELDS = {
  controlName: ["ccf control", "control", "new common control name", "ccf control name", "control id"],
  oldFrameworkVersion: ["old framework version", "previous framework version", "old version", "from version", "framework version (old)"],
  newFrameworkVersion: ["new framework version", "updated framework version", "new version", "to version", "framework version (new)"],
  oldSectionId: ["old source section id", "previous source section id", "old section id", "csf 1.1 section id", "source section id (old)"],
  newSectionId: ["new source section id", "updated source section id", "new section id", "csf 2.0 section id", "source section id (new)"],
  previousFunction: ["previous function", "previous function/domain", "old function", "csf 1.1 function", "previous domain"],
  newFunction: ["new function", "new function/domain", "updated function", "csf 2.0 function", "new domain"],
  previousCitation: ["previous citation", "old citation", "csf 1.1 citation", "existing citation"],
  updatedCitation: ["updated citation", "new citation", "csf 2.0 citation"],
  existingTestProcedure: ["existing test procedure", "existing test procedure statement", "current test procedure", "old test procedure"],
  updatedTestProcedure: ["updated test procedure", "updated test procedure statement", "new test procedure", "revised test procedure"],
  existingEvidence: ["existing evidence", "current evidence", "old evidence"],
  additionalEvidence: ["additional evidence", "new evidence", "updated evidence"],
  scenario: ["scenario", "change scenario", "impact scenario", "mapping change"],
} as const;
export type TransitionField = keyof typeof TRANSITION_FIELDS;

export const FIELD_LABELS: Record<TransitionField, string> = {
  controlName: "CCF control",
  oldFrameworkVersion: "Old framework version",
  newFrameworkVersion: "New framework version",
  oldSectionId: "Old source section ID",
  newSectionId: "New source section ID",
  previousFunction: "Previous function / domain",
  newFunction: "New function / domain",
  previousCitation: "Previous citation",
  updatedCitation: "Updated citation",
  existingTestProcedure: "Existing test procedure statement",
  updatedTestProcedure: "Updated test procedure statement",
  existingEvidence: "Existing evidence",
  additionalEvidence: "Additional evidence",
  scenario: "Scenario",
};

/** Minimum needed to show a meaningful comparison. */
const REQUIRED: TransitionField[] = ["previousCitation", "updatedCitation"];

export interface TransitionRow {
  sourceSheet: string;
  sourceRow: number;
  raw: Record<string, string | null>;
  values: Partial<Record<TransitionField, string | null>>;
}

export interface TransitionParse {
  sheets: SheetSummary[];
  /** Per sheet: canonical field → original header (or null when not found). */
  columnMap: Record<string, Partial<Record<TransitionField, string | null>>>;
  rows: TransitionRow[];
  issues: Issue[];
  isSample: boolean;
}

export function parseTransitionWorkbook(wb: ParsedWorkbook, fileName: string): TransitionParse {
  const sheets = summariseSheets(wb).map((s) => ({ ...s, role: "UNRECOGNISED" as const }));
  const issues: Issue[] = [];
  const columnMap: TransitionParse["columnMap"] = {};
  const rows: TransitionRow[] = [];
  // Sample files must say so in their name or a "SAMPLE" sheet; they are flagged everywhere.
  const isSample = /sample|example|illustrative/i.test(fileName) || wb.sheetNames.some((n) => /^sample/i.test(n));

  for (const name of wb.sheetNames) {
    const sheet = wb.sheets.get(name)!;
    if (!sheet.headerRow || !sheet.rows.length) continue;
    const map: Partial<Record<TransitionField, string | null>> = {};
    const keys = new Map(sheet.headers.map((h) => [headerKey(h), h]));
    for (const [field, aliases] of Object.entries(TRANSITION_FIELDS) as [TransitionField, readonly string[]][]) {
      map[field] = aliases.map((a) => keys.get(a)).find(Boolean) ?? null;
    }
    const matched = Object.values(map).filter(Boolean).length;
    if (matched < 2) {
      issues.push({ severity: "INFO", code: "SHEET_NOT_IMPORTED", sheet: name, message: "No transition columns recognised on this sheet." });
      continue;
    }
    columnMap[name] = map;
    const missing = REQUIRED.filter((f) => !map[f]);
    if (missing.length)
      issues.push({ severity: "WARNING", code: "MISSING_COLUMNS", sheet: name, message: `Columns not recognised: ${missing.map((m) => FIELD_LABELS[m]).join(", ")}. Comparison will show those fields as missing.` });
    for (const f of Object.keys(TRANSITION_FIELDS) as TransitionField[])
      if (!map[f] && !REQUIRED.includes(f)) issues.push({ severity: "INFO", code: "FIELD_NOT_FOUND", sheet: name, message: `No column for “${FIELD_LABELS[f]}”.` });

    for (const { rowNumber, values } of sheet.rows) {
      const v: TransitionRow["values"] = {};
      for (const [f, h] of Object.entries(map) as [TransitionField, string | null][]) v[f] = h ? values[h]?.trim() || null : null;
      if (!Object.values(v).some(Boolean)) continue;
      rows.push({ sourceSheet: name, sourceRow: rowNumber, raw: values, values: v });
    }
  }
  if (!rows.length) issues.push({ severity: "ERROR", code: "NO_ROWS", message: "No transition rows found. Check that the workbook has a header row with the expected columns." });
  return { sheets, columnMap, rows, issues, isSample };
}
