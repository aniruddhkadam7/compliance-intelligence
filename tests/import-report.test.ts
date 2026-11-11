// Unit tests for the per-worksheet import report shown on Data & Imports.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildImportReport } from "../src/lib/ingest/report";
import type { Issue, SheetSummary } from "../src/lib/ingest/ccf-workbook";

const sheet = (name: string, role: SheetSummary["role"], over: Partial<SheetSummary> = {}): SheetSummary => ({
  name, role, headerRow: 1, headers: ["A", "B", "C"], rowCount: 10, missingRequired: [], preview: [], ...over,
});
const notImported = (name: string): Issue => ({ severity: "INFO", code: "SHEET_NOT_IMPORTED", sheet: name, message: "Worksheet is not used by the client control import." });

describe("import report", () => {
  test("imported, checked and skipped sheets are counted separately; rows and headers only from sheets that were read", () => {
    const { report } = buildImportReport(
      [sheet("Controls", "CONTROLS", { rowCount: 139, headers: Array(24).fill("h") }), sheet("Metrics", "METRICS", { rowCount: 5 }), sheet("Notes", "UNRECOGNISED", { rowCount: 900 })],
      [notImported("Notes")],
    );
    assert.deepEqual(report.sheets.map((s) => s.status), ["IMPORTED", "CHECKED", "SKIPPED"]);
    assert.deepEqual(report.summary, { worksheets: 3, imported: 1, checked: 1, skipped: 1, blocked: 0, rows: 144, headers: 27 });
    assert.equal(report.outcome, "READY");
  });

  test("a skipped sheet gets a specific reason, and the stored finding says the same", () => {
    const { report, issues } = buildImportReport([sheet("Review", "UNRECOGNISED", { headerRow: 6, headers: ["NIST source ID", "Decision"] })], [notImported("Review")]);
    assert.match(report.sheets[0].reason!, /headers in row 6 \(“NIST source ID”, “Decision”\)/);
    assert.equal(issues[0].message, report.sheets[0].reason);
  });

  test("a parser's own reason wins over the generic one", () => {
    const why = "Column “NIST CSF 1.1” is headed as NIST CSF 1.1 but its IDs belong to NIST AI RMF 1.0; the column was skipped.";
    const { report } = buildImportReport([sheet("Legacy Vs. Latest", "UNRECOGNISED")], [notImported("Legacy Vs. Latest"), { severity: "WARNING", code: "RELATIONSHIP_MATRIX", sheet: "Legacy Vs. Latest", message: why }]);
    assert.equal(report.sheets[0].reason, why);
  });

  test("empty sheets and sheets without a header row say so", () => {
    const { report } = buildImportReport([sheet("Blank", "UNRECOGNISED", { headerRow: null, headers: [] }), sheet("Header only", "UNRECOGNISED", { rowCount: 0 })], []);
    assert.match(report.sheets[0].reason!, /No header row/);
    assert.match(report.sheets[1].reason!, /no data rows/);
  });

  test("missing columns block the sheet and the import; column problems are grouped by column", () => {
    const { report } = buildImportReport(
      [sheet("Controls", "CONTROLS", { missingRequired: ["Control Name"] }), sheet("Map", "PROCEDURE_MAP")],
      [
        { severity: "ERROR", code: "MISSING_COLUMNS", sheet: "Controls", message: "Missing required column(s): Control Name" },
        { severity: "WARNING", code: "UNKNOWN_SECTION_ID", sheet: "Map", row: 4, column: "Source Section ID", message: "Unknown Source Section ID 9.9" },
        { severity: "WARNING", code: "UNKNOWN_SECTION_ID", sheet: "Map", row: 7, column: "Source Section ID", message: "Unknown Source Section ID 9.8" },
      ],
    );
    assert.equal(report.sheets[0].status, "BLOCKED");
    assert.deepEqual(report.sheets[0].missingColumns, ["Control Name"]);
    assert.equal(report.outcome, "ACTION_NEEDED");
    assert.deepEqual(report.sheets[1].columnProblems.map((p) => [p.column, p.rows]), [["Source Section ID", 2]]);
    assert.equal(report.sheets[1].status, "IMPORTED");
  });

  test("library sheets are skipped when the library could not be updated", () => {
    const { report } = buildImportReport([sheet("Citation Sources", "CITATIONS")], [{ severity: "WARNING", code: "MISSING_COLUMNS", message: "Document library not updated: Missing required column(s): Source Section ID" }]);
    assert.equal(report.sheets[0].status, "SKIPPED");
    assert.match(report.sheets[0].reason!, /^Document library not updated/);
  });
});
