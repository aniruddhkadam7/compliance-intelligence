/** Human labels for import issue codes (see src/lib/ingest/ccf-workbook.ts). */
export const ISSUE_LABELS: Record<string, string> = {
  MISSING_SHEET: "Required worksheet missing",
  MISSING_COLUMNS: "Required columns missing",
  MISSING_VALUE: "Required value empty",
  DUPLICATE_KEY: "Duplicate key",
  UNKNOWN_SOURCE: "Citation references unknown source",
  UNKNOWN_REQUIREMENT: "Reference to unknown requirement",
  SHEET_MAPPING_CONFLICT: "Working sheet mapping differs from authoritative",
  UNRESOLVED_MAPPING: "Mapping value is not a Requirement ID",
  MISSING_MAPPING: "Control without primary mapping",
  DUPLICATE_VALUE: "Duplicate Control Identifier",
  RARE_VALUE: "Rare categorical value (possible variant)",
  COUNT_MISMATCH: "Stated mapping count differs",
  CHECK_PASSED: "Mapping count check passed",
  UNLABELLED_COLUMN: "Unlabelled column imported",
  SHEET_NOT_IMPORTED: "Worksheet not imported",
  IR_LIST_CHECK: "IR ID list validated",
  UNMAPPED_REQUIREMENTS: "Prioritised IRs without CCF mapping",
  REVIEW_NOW_MAPPED: "Review sheet IR now mapped",
  WORKING_ROW_MISSING: "Control missing on working sheet",
};

export const TP_KIND_LABELS: Record<string, string> = {
  CCF_V2: "Test Procedures (CCF v2)",
  ARC_WITHOUT_CITATIONS: "ArC Test Procedures without Citations",
  ARC_WITH_CITATIONS: "ArC Test Procedures with Citations",
  CCF_V1: "Test Procedures (CCF V1)",
};

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  GO_LIVE: "Recommended Evidences (Go-live)",
  CCF_V1: "Recommended Evidences (CCFv1.0)",
  CCF_V1_UPDATED: "Recommended Evidences Updated (CCFv1.0)",
};
