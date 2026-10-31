# Data Dictionary — `CCF Demonstration.xlsx`

Inspected 2026-10-31 with SheetJS 0.20.3. All counts below are verified against the workbook and are
re-checked automatically on every import (see `src/lib/ingest/ccf-workbook.ts`). The original workbook is never modified.

## Workbook at a glance

| # | Worksheet | Range | Data rows | Role in the application |
|---|-----------|-------|-----------|-------------------------|
| 1 | `Sheet1` | A1:A80 | 80 | Header-less list of IR IDs. Identical to the IR IDs of the `Unmapped IRs (2/3/Natesh/NR)` sheets. Validated, not stored. |
| 2 | `Unmapped IRs (3)` | A1:N81 | 80 | Unmapped-IR review analysis (PTF / NPTF results, remarks, candidate controls). |
| 3 | `Unmapped IRs (2)` | A1:Q81 | 80 | Same analysis with separate `(AI)` columns alongside reviewed columns. |
| 4 | `Unmapped IRs (Natesh)` | A1:I81 | 80 | Reviewer variant (Result, CCF Control Mapping, Controls, Remarks). |
| 5 | `Unmapped IRs (NR)` | A1:K81 | 80 | Reviewer variant (adds `PTF/NPTF`, empty in all rows; one unlabelled column K). |
| 6 | `CCFv2 (Metadata)` | A1:AK423 | 422 | **Authoritative CCF control register** (37 columns). |
| 7 | `Unmapped IRs (Old)` | A1:K82 | 81 | Earlier review analysis (81 IRs). |
| 8 | `Metrics(Hidden)` | A1:B252 | 251 | Count of controls per IR. Used as an integrity check. |
| 9 | `ArC Parent Sources (Metadata)` | A1:I28 | 27 | Authoritative sources (frameworks / regulations), all `Prioritized by GSK? = Yes`. |
| 10 | `ArC Full IR Ref (Metadata)` | A1:H330 | 329 | ArC Integrated Requirements (IR). |
| 11 | `ArC Citations to Sources (Meta)` | A1:F5167 | 5,166 | Source sections (citations), each linked to one IR and one source. |
| 12 | `Metadata(CCFv2)` | A1:BM423 | 422 | Working copy of the control register (65 columns) incl. per-standard crosswalk columns. |

### Verified headline figures

| Figure | Brief (preliminary) | Verified |
|---|---|---|
| CCF controls | ~422 | **422** (unique `New Common Control Name `) |
| Citation relationships | ~5,166 | **5,166** (unique `Source Section ID`; each links to exactly one IR) |
| Integrated requirements | ~329 | **329** (unique `Requirement ID`) |
| Prioritised sources | ~27 | **27** |
| IRs cited by prioritised sources | – | 251 (`Found in Prioritized Sources? = Yes`) |
| IRs with ≥1 authoritative CCF mapping | – | 171 |
| Prioritised IRs with no CCF mapping | – | 80 (= the `Unmapped IRs` sheets) |

## Relationship model

```
ArC Parent Sources ──1:N──▶ ArC Citations ──N:1──▶ ArC Full IR Ref ◀──N:1── CCFv2 control
   "Source ID"          "Parent Source ID…"   "Requirement ID"        "ARC Mapping" (primary)
                         "Source Section ID"                           "Secondary ArC Mapping"
```

* **Framework → Citation**: `ArC Citations….Parent Source ID (ArC Authoritative Source - GSK has selected 27…)` = `ArC Parent Sources.Source ID`. 100% resolve.
* **Citation → IR**: `ArC Citations….Requirement ID` = `ArC Full IR Ref.Requirement ID`. 100% resolve. 251 distinct IRs are cited.
* **CCF control → IR**: `CCFv2 (Metadata).ARC Mapping` (primary, 1 per control) and `Secondary ArC Mapping` (0–1 per control) hold Requirement IDs.
* **Cross-framework relationships** are *not* stated directly. Two sources are related only when their citations link to the same IR. The app labels these "shared integrated requirement" relationships and never calls them equivalences.

## Sheet details

### `ArC Parent Sources (Metadata)` — key `Source ID`
| Column | Notes |
|---|---|
| Prioritized by GSK? | `Yes` on all 27 rows |
| Source ID | ArC numeric id (string), unique |
| Source Name | Full title incl. version, e.g. `NIST Cybersecurity Framework (CSF) 2.0` |
| Description | Free text |
| Group | e.g. `Federal`, `Cross-Industry - ISO` |
| Type | `Good Practice`, `Law or Regulation`, `Industry Standard` |
| Jurisdiction | `US`, `EU`, `Global`, `China` |
| Licensing | `Publicly Available` / `License required` |
| Document URL | Official document link |

No publication date column exists. The app derives a **version label** and **family** from `Source Name`, e.g. family `NIST CSF` with versions 1.1 (490) and 2.0 (959), and shows them as derived.

### `ArC Citations to Sources (Meta)` — key `Source Section ID`
| Column | Notes |
|---|---|
| Parent Source ID (ArC Authoritative Source - GSK has selected 27. Please refer to the ArC Parent Sources tab for more details) | FK → source (long header preserved verbatim) |
| Auth. Source | Source name as repeated in this sheet |
| Requirement ID | FK → IR |
| Source Section ID | Unique across all 5,166 rows |
| Source Section Name | Hierarchical path, e.g. `NIST CSF v2.0 - Detect (DE) - Continuous Monitoring (DE.CM) - DE.CM-03` |
| *(column F, no header)* | Full section text (present on every row, up to 14,432 chars). Imported as `sectionText`. |

Citations per source range from 29 (21 CFR 11) to 1,193 (NIST SP 800-53 r5.1.1). Section names include parent levels, for example `NIST CSF v2.0 - Detect (DE)`, so a "citation" can be a function, a category or a subcategory.

### `ArC Full IR Ref (Metadata)` — key `Requirement ID`
Columns: `Requirement ID`, `Risk Topic`, `Requirement Name`, `Risk statement`, `Found in Prioritized Sources?` (251 Yes / 78 No), `Count in CCF v2 Mapping?` (0–12), `Control objective`, `Class` (all `Regulatory Requirements`).
78 IRs have no citations; these are exactly the IRs not found in prioritised sources.

### `CCFv2 (Metadata)` — key `New Common Control Name ` (note trailing space in header)
Authoritative register. Evidence: its `ARC Mapping` counts per IR match `Count in CCF v2 Mapping?` and `Metrics(Hidden)` exactly (0 mismatches). The working sheet shows 40 and 34 mismatches respectively.
Control name prefixes encode domain + scope, e.g. `AI-CCF`, `AM-DCJ`, `DS-OT`, `REG-SOX`, `ID-GXP`.

Grouped columns:
* **Identity / scope**: Scope (GRC/CSO/OT/DCJ), Coverage in ISMS Standards, Control Categories (42), Control Sub Category, Common Control Title, Control Objective.
* **Mapping**: ARC Mapping, ARC Requirement Name, Risk Topic, Secondary ArC Mapping, ArC Mapping\nRisk Statement, ArC Mapping\nRisk Objective.
* **Statements**: Control Activity Statement (CCFv1.0 / CCFv2.0), Monitoring Statements, ArC Activity Statement, Standards Control Mapping\n(CCFv2.0), Mapped ISMS Standard Sub-Controls.
* **Testing**: Test Procedures, ArC Test Procedures without Citations, ArC Test Procedures with Citations, Prioritized ArC Test Procedures.
* **Evidence / monitoring**: Recommended Evidences (Go-live), Monitoring criteria, Tools/Documents (CCF V2).
* **Governance notes**: Notes / Comments / Feedback, Team Comments, GSK Assignee, GSK Comments, TrustCloud Notes, Related GSK Standard.

### `Metadata(CCFv2)` — working copy (65 columns)
Same 422 controls in the same order. It adds Mapper, QA done, `GSK Ready for Review?` (371 single recommendation / 43 multiple options / 8 approved), `GSK Approved OR  To Discuss`, Control Identifier, Control Bucket, v1 test procedures and evidence columns, and **13 standards crosswalk columns**: `NIST 800 53`, `NIST CSF 1.1`, `NIST CSF 2.0`, `ISO/IEC 27001:2013`, `ISO/IEC:27002`, `ISO 27017:2015`, `CIS Top 18`, `CSA CCM`, `GDPR`, `ISO27018`, `PCI DSS`, `GxP`, `SOX`.
67 controls carry both `NIST CSF 1.1` and `NIST CSF 2.0` references.

### `Unmapped IRs (…)` sheets — key `IR ID`
Review analyses for the 80 prioritised IRs without a CCF mapping. Each sheet keeps its own columns, for example `Result(PTF)`, `Remarks(NPTF)` and `Controls(PTF)(AI)`.
**These hold candidate matches, not approved mappings.** The app shows them in a review panel and never links them to controls.

### `Metrics(Hidden)` — `Requirement ID`, `ArC Mapping Count`
251 rows, used only as an integrity check.

## Data quality findings (reproduced as import issues)

| Finding | Count | Handling |
|---|---|---|
| Working sheet `ARC Mapping` differs from authoritative sheet | 24 controls | Both stored; authoritative used; conflict shown on control page and Data Quality panel |
| Mapping values that are not Requirement IDs (`Retire CCF control` on IR-CCF-1; 3 free-text secondary values) | 4 | Stored as text, not linked |
| Duplicate `Control Identifier` (working sheet) | 15 ids | Reported |
| Rare categorical values (e.g. `Coverage in ISMS Standards = 51` on RM-CCF-7; 9 spellings of Technical/Non-technical) | see import | Reported; originals preserved |
| Citation sheet column F has no header | 1 column | Imported as section text |
| `Unmapped IRs (Old)` has 81 IRs vs 80 elsewhere | 1 | Stored per sheet |
| Duplicate keys / orphan foreign keys | 0 | — |

## Missing inputs

1. **CSF 1.1 → 2.0 transition workbook**: the ~5–6 verified Govern examples with updated test procedures and evidence. The Version Impact module imports it; until then it shows only workbook-derived reference changes.
2. Source publication dates are not in the workbook. They come from connectors where an official machine-readable source exists.
