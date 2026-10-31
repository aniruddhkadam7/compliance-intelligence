# Workbook → Application Mapping

How each worksheet becomes database records (`prisma/schema.prisma`). Every imported row keeps:
* `raw`: the original row as `{ original header: original cell text }`, including untrimmed headers such as `New Common Control Name `.
* `sourceSheet` and `sourceRow`: the Excel row number, used for traceability.

| Worksheet | Model | Key | Notes |
|---|---|---|---|
| ArC Parent Sources (Metadata) | `Framework` | `sourceId` ← Source ID | Upserted by Source ID so connector links survive re-imports. `family` / `versionLabel` are derived from Source Name. |
| ArC Citations to Sources (Meta) | `Citation` + `RequirementCitation` | `sourceSectionId` ← Source Section ID | `frameworkId` via Parent Source ID; IR link in join table (data is 1:1 today, model allows N:M). Column F → `sectionText`. |
| ArC Full IR Ref (Metadata) | `IntegratedRequirement` | `requirementId` | `Count in CCF v2 Mapping?` stored as `statedCcfMappingCount` (as stated) and checked against actual mappings. |
| CCFv2 (Metadata) | `CcfControl` | `controlName` | Authoritative. Matching `Metadata(CCFv2)` row stored as `workingRaw`. |
| CCFv2 (Metadata) `ARC Mapping` / `Secondary ArC Mapping` | `ControlRequirementMapping` (`authoritative = true`) | — | `PRIMARY` / `SECONDARY`. Non-numeric values kept in `rawValue` with `requirementId = null`. |
| Metadata(CCFv2) `ARC Mapping` / `Secondary ArC Mapping` | `ControlRequirementMapping` (`authoritative = false`) | — | Shown only as "working sheet" values / conflicts. |
| Test procedure columns | `TestProcedure` | — | `CCF_V2` ← Test Procedures; `ARC_WITHOUT_CITATIONS`, `ARC_WITH_CITATIONS`; `CCF_V1` ← Test Procedures (CCF V1) (working sheet). `NA` placeholders skipped. |
| Evidence columns | `EvidenceRequirement` | — | `GO_LIVE` ← Recommended Evidences (Go-live); `CCF_V1`, `CCF_V1_UPDATED` (working sheet). |
| Metadata(CCFv2) crosswalk columns | `ControlFrameworkReference` | — | Original column name + raw text + comma-split `tokens`. |
| Unmapped IRs (…) | `UnmappedRequirementReview` | (IR, sheet) | Raw analysis row per sheet. Never converted into mappings. |
| Metrics(Hidden), Sheet1 | — | — | Validation only (import issues). |

## Traceability chain used in the UI

```
Framework (Source ID) → Citation (Source Section ID) → Integrated Requirement (Requirement ID) → CCF control (New Common Control Name)
```

Only authoritative mappings draw edges in graphs and drive coverage metrics.

## Metric definitions (Overview)

| Metric | Definition |
|---|---|
| Frameworks | `Framework` rows |
| Citations | `Citation` rows |
| CCF controls | `CcfControl` rows |
| Integrated requirements | `IntegratedRequirement` rows |
| Mapping coverage | prioritised IRs with ≥1 authoritative primary or secondary mapping ÷ prioritised IRs |
| Unmapped requirements | prioritised IRs with no authoritative mapping |
| Updates available | `FrameworkUpdate` with `reviewStatus = NEW` |
| Last synchronisation | latest successful `Connector.lastSuccessAt` |

## Import semantics

* **Preview** (`POST /api/import/preview`): parse, validate and summarise. A `PREVIEWED` job and its issues are recorded; reference data is not touched.
* **Confirm** (`POST /api/import/confirm`): re-upload of the same file (SHA-256 must match the preview). Workbook-derived tables are replaced in a single transaction. Connectors, update history, version transitions and audit logs are preserved.
* Blocking errors (missing sheets or required columns, orphan keys, duplicate keys) fail the import. Warnings and info items are recorded and shown.
