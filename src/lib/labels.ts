/** Human labels for import issue codes (see src/lib/ingest/ccf-workbook.ts). */
export const ISSUE_LABELS: Record<string, string> = {
  MISSING_SHEET: "Required worksheet missing",
  MISSING_COLUMNS: "Required columns missing",
  MISSING_VALUE: "Required value empty",
  DUPLICATE_KEY: "Duplicate key",
  UNKNOWN_SOURCE: "Citation references unknown source",
  UNKNOWN_REQUIREMENT: "Reference to unknown requirement",
  SHEET_MAPPING_CONFLICT: "Working sheet mapping differs from authoritative",
  UNRESOLVED_MAPPING: "Mapping value could not be resolved",
  MISSING_MAPPING: "Control without primary mapping",
  DUPLICATE_VALUE: "Duplicate Control Identifier",
  RARE_VALUE: "Rare categorical value (possible variant)",
  COUNT_MISMATCH: "Stated mapping count differs",
  CHECK_PASSED: "Mapping count check passed",
  UNLABELLED_COLUMN: "Unlabelled column imported",
  SHEET_NOT_IMPORTED: "Worksheet not imported",
  IR_LIST_CHECK: "Reference list validated",
  UNMAPPED_REQUIREMENTS: "Requirements without a control mapping",
  REVIEW_NOW_MAPPED: "Review sheet item now mapped",
  WORKING_ROW_MISSING: "Control missing on working sheet",
  MISSING_SECTION_ID: "Obligations without a Source Section ID",
  ID_CONVENTION: "Source ID convention inconsistency",
  SOURCE_LIST_MISMATCH: "Framework list disagrees with obligations",
  METADATA_NOT_FOUND: "Framework details not found",
  UNKNOWN_CONTROL: "Test procedure for unknown control",
  UNKNOWN_SECTION_ID: "Mapping to unknown Source Section ID",
  SOURCE_ID_RENUMBERED: "Document renumbered in this file",
  DOCUMENT_ADDED: "New document",
  RELATIONSHIP_MATRIX: "Relationship sheet read",
  CONTROLS_OUTSIDE_REGISTER: "Controls outside the client register",
  CONTROL_REGISTER: "Control register and client selection",
  PROCEDURE_UNMAPPED: "Test procedure without mapping",
  UNMAPPED_CONTROLS: "Controls without mapping",
  MAPPING_SUMMARY: "Mapping summary",
};

/** How a control is linked to an obligation. */
export const mappingLabel = (type: string) => ({ PROCEDURE: "test procedure", PRIMARY: "primary", SECONDARY: "secondary", DEMO: "illustrative" })[type] ?? type.toLowerCase();

export const TP_KIND_LABELS: Record<string, string> = {
  PROCEDURE: "Test procedure",
  CCF_V2: "Test Procedures (CCF v2)",
  ARC_WITHOUT_CITATIONS: "Test Procedures without references",
  ARC_WITH_CITATIONS: "Test Procedures with references",
  CCF_V1: "Test Procedures (CCF V1)",
};

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  GO_LIVE: "Recommended Evidences (Go-live)",
  CCF_V1: "Recommended Evidences (CCFv1.0)",
  CCF_V1_UPDATED: "Recommended Evidences Updated (CCFv1.0)",
};
