import { test } from "node:test";
import assert from "node:assert/strict";
import { controlLabel } from "../src/lib/queries/ccm-crosswalk";

// Headings exactly as imported from the mapping workbooks.
const cases: [string, string, string][] = [
  ["CSA-CCM v4.0 Implementation Guidelines - TVM-08", "TVM-08", ""],
  ["9.1 - Monitoring, measurement, analysis and evaluation", "9.1", "Monitoring, measurement, analysis and evaluation"],
  ["6.1.1 - Actions to address risks and opportunities - General", "6.1.1", "Actions to address risks and opportunities – General"],
  ["ISO/IEC 27002:2013 - 15. Supplier relationships - 15.2.1 - Monitoring and review of supplier services", "15.2.1", "Monitoring and review of supplier services"],
  ["ISO/IEC 27002:2022 - 8. Technological Controls - 8.8", "8.8", "Technological Controls"],
  ["ISO/IEC 27018:2019 - 9 Access control - 9.4 System and application access control", "9.4", "System and application access control"],
  ["NIST CSF v2.0 - Govern (GV) - Organizational Context (OC) - GV.OC-01", "GV.OC-01", "Organizational Context (OC)"],
  ["NIST SP 800-53 r5.1.1: SC-12(05)-PKI CERTIFICATES / HARDWARE TOKENS", "SC-12(05)", "Pki certificates / hardware tokens"],
  ["EU AI Act - Chapter II - Prohibited AI Practices - Article 5(1)", "Article 5(1)", "Prohibited AI Practices"],
  ["Regulation (EU) 2016/679 - Article 32 Security of processing", "Article 32", "Security of processing"],
  ["China - Personal Information Protection Law Chapter V - Obligations of Personal Information Processors: Article 51(3)", "Article 51(3)", "Obligations of Personal Information Processors"],
  ["IEC Standard 62443-4-2:2019 Technical Security Requirements for IACS Components 11.8 CR 7.6 - Network and security configuration settings 11.8.2", "11.8.2", "Network and security configuration settings"],
  ["CIS Controls v8 - Control 2: Inventory and Control of Software Assets - 2.5", "2.5", "Inventory and Control of Software Assets"],
  ["COBIT 4.1 - DS2.2 Supplier Relationship Management", "DS2.2", "Supplier Relationship Management"],
  ["FDA: Title 21 Part 11 - Subpart B, Electronic Records - 11.10k(2) Controls for closed systems", "11.10k(2)", "Controls for closed systems"],
  ["ISO-IEC 42001:2023 - 9 Performance Evaluation - 9.2 - 9.2.2", "9.2.2", "Performance Evaluation"],
  ["Sarbanes-Oxley Act of 2002 - Sec. 206", "Sec. 206", ""],
];

test("mapped control identifier and title are read from each publisher's heading", () => {
  for (const [heading, identifier, title] of cases) assert.deepEqual(controlLabel(heading), { identifier, title }, heading);
});

import { ccmImportState, type ImportJobLite } from "../src/lib/queries/ccm-crosswalk";

const at = (h: number) => new Date(Date.UTC(2026, 10, 10, h));
const job = (id: string, status: string, h: number, crossFramework = 1128, kind = "CLIENT_CONTROLS"): ImportJobLite =>
  ({ id, kind, status, counts: { crossFramework }, createdAt: at(h), completedAt: status === "PREVIEWED" ? null : at(h) });
// Import jobs are listed newest first, as the page reads them.
const state = (jobs: ImportJobLite[], source: string | null = null) => {
  const r = ccmImportState([...jobs].sort((a, b) => +b.createdAt - +a.createdAt), source);
  return { state: r.state, attempt: r.attempt?.id ?? null };
};

test("CCM page state follows the import records", () => {
  // Nothing uploaded.
  assert.deepEqual(state([]), { state: "NO_DATA", attempt: null });
  // Uploaded and validated, never imported.
  assert.deepEqual(state([job("v1", "PREVIEWED", 1)]), { state: "AWAITING_IMPORT", attempt: "v1" });
  // Validation of a workbook without a mapping sheet is not a CCM upload.
  assert.deepEqual(state([job("v1", "PREVIEWED", 1, 0)]), { state: "NO_DATA", attempt: null });
  // Import attempted and failed.
  assert.deepEqual(state([job("v1", "PREVIEWED", 1), job("f1", "FAILED", 2)]), { state: "IMPORT_FAILED", attempt: "f1" });
  // Re-validated after the failure: awaiting import again.
  assert.deepEqual(state([job("f1", "FAILED", 2), job("v2", "PREVIEWED", 3)]), { state: "AWAITING_IMPORT", attempt: "v2" });
  // Imported, but no CCM mappings were written.
  assert.deepEqual(state([job("v1", "PREVIEWED", 1), job("c1", "COMPLETED", 2)]), { state: "EMPTY_IMPORT", attempt: "c1" });
  // Imported with CCM mappings: the validation that led to it is not "awaiting".
  assert.deepEqual(state([job("v1", "PREVIEWED", 1), job("c1", "COMPLETED", 2)], "c1"), { state: "READY", attempt: null });
  // A newer upload after a successful import is reported next to the table.
  assert.deepEqual(state([job("c1", "COMPLETED", 2), job("v2", "PREVIEWED", 3)], "c1"), { state: "READY", attempt: "v2" });
  assert.deepEqual(state([job("c1", "COMPLETED", 2), job("f2", "FAILED", 3)], "c1"), { state: "READY", attempt: "f2" });
  // A later import without CCM mappings leaves the earlier mappings in place; its own validation is not pending.
  assert.deepEqual(state([job("c1", "COMPLETED", 2), job("v2", "PREVIEWED", 3, 0), job("c2", "COMPLETED", 4, 0)], "c1"), { state: "READY", attempt: null });
});
