// Validation + normalisation of the CCF demonstration workbook.
// Pure functions: no database access, so preview and confirm share one code path.

import { randomUUID } from "node:crypto";
import { clean, findHeader, findHeaderByPrefix, type ParsedSheet, type ParsedWorkbook, type RawRow } from "./parse";
import { deriveFamily, deriveVersion } from "@/lib/frameworks";

export const SHEETS = {
  sources: "ArC Parent Sources (Metadata)",
  citations: "ArC Citations to Sources (Meta)",
  requirements: "ArC Full IR Ref (Metadata)",
  controls: "CCFv2 (Metadata)", // authoritative: agrees with "Count in CCF v2 Mapping?"
  controlsWorking: "Metadata(CCFv2)", // working copy with standards crosswalk columns
  metrics: "Metrics(Hidden)",
  irList: "Sheet1",
} as const;

export const UNMAPPED_PREFIX = "Unmapped IRs";

export type SheetRole =
  | "SOURCES"
  | "CITATIONS"
  | "REQUIREMENTS"
  | "CONTROLS"
  | "CONTROLS_WORKING"
  | "METRICS"
  | "IR_ID_LIST"
  | "UNMAPPED_REVIEW"
  | "PROCEDURE_MAP"
  | "SOURCE_LIST"
  | "SOURCE_METADATA"
  | "UNRECOGNISED";

const REQUIRED: Record<string, string[]> = {
  [SHEETS.sources]: ["Prioritized by GSK?", "Source ID", "Source Name"],
  [SHEETS.citations]: ["Auth. Source", "Requirement ID", "Source Section ID", "Source Section Name"],
  [SHEETS.requirements]: ["Requirement ID", "Requirement Name", "Count in CCF v2 Mapping?"],
  [SHEETS.controls]: ["New Common Control Name", "ARC Mapping", "Secondary ArC Mapping"],
  [SHEETS.controlsWorking]: ["New Common Control Name", "ARC Mapping"],
  [SHEETS.metrics]: ["Requirement ID", "ArC Mapping Count"],
};

/** Crosswalk columns on the working sheet that state external framework references. */
export const CROSSWALK_COLUMNS = [
  "NIST 800 53",
  "NIST CSF 1.1",
  "NIST CSF 2.0",
  "ISO/IEC 27001:2013",
  "ISO/IEC:27002",
  "ISO 27017:2015",
  "CIS Top 18",
  "CSA CCM",
  "GDPR",
  "ISO27018",
  "PCI DSS",
  "GxP",
  "SOX",
];

export interface Issue {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  sheet?: string;
  row?: number;
  column?: string;
  message: string;
}

export interface SheetSummary {
  name: string;
  role: SheetRole;
  headerRow: number | null;
  headers: string[];
  rowCount: number;
  missingRequired: string[];
  preview: RawRow[];
}

export const id = () => randomUUID();
const asBool = (v: string | null) => (v === null ? null : /^y(es)?$/i.test(v));
const isReqId = (v: string | null): v is string => !!v && /^\d+$/.test(v);

export function sheetRole(name: string): SheetRole {
  switch (name) {
    case SHEETS.sources: return "SOURCES";
    case SHEETS.citations: return "CITATIONS";
    case SHEETS.requirements: return "REQUIREMENTS";
    case SHEETS.controls: return "CONTROLS";
    case SHEETS.controlsWorking: return "CONTROLS_WORKING";
    case SHEETS.metrics: return "METRICS";
    case SHEETS.irList: return "IR_ID_LIST";
  }
  return name.startsWith(UNMAPPED_PREFIX) ? "UNMAPPED_REVIEW" : "UNRECOGNISED";
}

/** Accessor bound to one sheet: reads a column by normalised header name. */
export function reader(sheet: ParsedSheet) {
  const cache = new Map<string, string | undefined>();
  const col = (name: string, prefix = false) => {
    const key = (prefix ? "p:" : "e:") + name;
    if (!cache.has(key)) cache.set(key, prefix ? findHeaderByPrefix(sheet, name) : findHeader(sheet, name));
    return cache.get(key);
  };
  return {
    col,
    get: (row: RawRow, name: string, prefix = false) => {
      const h = col(name, prefix);
      return h ? clean(row[h]) : null;
    },
  };
}

export function summariseSheets(wb: ParsedWorkbook, previewRows = 5): SheetSummary[] {
  return wb.sheetNames.map((name) => {
    const s = wb.sheets.get(name)!;
    const required = REQUIRED[name] ?? (sheetRole(name) === "UNMAPPED_REVIEW" ? ["IR ID"] : []);
    return {
      name,
      role: sheetRole(name),
      headerRow: s.headerRow,
      headers: s.headers,
      rowCount: s.rows.length,
      missingRequired: required.filter((r) => !findHeader(s, r)),
      preview: s.rows.slice(0, previewRows).map((r) => truncateRow(r.values)),
    };
  });
}

function truncateRow(row: RawRow, max = 160): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(row)) out[k] = v && v.length > max ? v.slice(0, max) + "…" : v;
  return out;
}

// ---------------------------------------------------------------------------

/** Control attributes read by header name; shared by every workbook format. */
export function controlFields(get: (header: string) => string | null) {
  return {
    scope: get("Scope (GRC/CSO/OT/DCJ)"), coverageInIsms: get("Coverage in ISMS Standards"),
    category: get("Control Categories"), subCategory: get("Control Sub Category"),
    title: get("Common Control Title"), objective: get("Control Objective"),
    activityStatementV1: get("Control Activity Statement (CCFv1.0)"), activityStatementV2: get("Control Activity Statement (CCFv2.0)"),
    monitoringStatements: get("Monitoring Statements"), technicalType: get("Technical/Non-technical Control"),
    standardsControlMapping: get("Standards Control Mapping (CCFv2.0)"), productImplementation: get("Product Implementation Guidance"),
    mappedIsmsSubControls: get("Mapped ISMS Standard Sub-Controls"), productTeamFacing: get("Product Team Facing? (CCFv2.0)"),
    orgLevel: get("Org. Level/Product Level (Proposed) v2.0"), arcActivityStatement: get("ArC Activity Statement"),
    monitoringCriteria: get("Monitoring criteria"), toolsDocuments: get("Tools/Documents (CCF V2)"),
    relatedGskStandard: get("Related GSK Standard"), gskAssignee: get("GSK Assignee"),
    gskComments: get("GSK Comments"), teamComments: get("Team Comments"), notes: get("Notes / Comments / Feedback"),
    arcRiskStatement: get("ArC Mapping Risk Statement"), arcRiskObjective: get("ArC Mapping Risk Objective"),
  };
}

export interface NormalisedDataset {
  frameworks: {
    id: string; sourceId: string; name: string; description: string | null; group: string | null; type: string | null;
    jurisdiction: string | null; licensing: string | null; documentUrl: string | null; prioritizedByGsk: boolean; applicability?: string | null;
    versionLabel: string | null; family: string; raw: RawRow; sourceSheet: string; sourceRow: number;
  }[];
  requirements: {
    id: string; requirementId: string; riskTopic: string | null; name: string | null; riskStatement: string | null;
    foundInPrioritized: boolean | null; statedCcfMappingCount: number | null; controlObjective: string | null;
    class: string | null; raw: RawRow; sourceSheet: string; sourceRow: number;
  }[];
  citations: {
    id: string; sourceSectionId: string; frameworkId: string; authSource: string; sectionName: string;
    sectionText: string | null; raw: RawRow; sourceSheet: string; sourceRow: number;
  }[];
  requirementCitations: { id: string; citationId: string; requirementId: string }[];
  controls: Record<string, unknown>[];
  mappings: {
    id: string; controlId: string; requirementId: string | null; mappingType: "PRIMARY" | "SECONDARY"; rawValue: string;
    authoritative: boolean; sourceSheet: string; sourceColumn: string;
  }[];
  testProcedures: { id: string; controlId: string; kind: string; procedureId?: string | null; text: string; sourceSheet: string; sourceColumn: string }[];
  /** Test procedure -> obligation links (source-ID workbooks). */
  procedureLinks: { id: string; testProcedureId: string; citationId: string }[];
  /** Control -> obligation: the mapping every screen reads. */
  controlObligations: { id: string; controlId: string; citationId: string; mappingType: string }[];
  evidence: { id: string; controlId: string; kind: string; text: string; sourceSheet: string; sourceColumn: string }[];
  frameworkReferences: { id: string; controlId: string; columnName: string; referenceRaw: string; tokens: string[]; sourceSheet: string }[];
  reviews: { id: string; requirementId: string; sheetName: string; raw: RawRow; sourceRow: number }[];
}

export interface NormaliseResult {
  dataset: NormalisedDataset;
  issues: Issue[];
  sheets: SheetSummary[];
  counts: Record<string, number>;
}

/** "Blank-ish" placeholders that the workbook uses for "no value". */
export const isPlaceholder = (v: string | null) => !v || /^(na|n\/a|0|-|nil)$/i.test(v.trim());

export function normaliseCcfWorkbook(wb: ParsedWorkbook): NormaliseResult {
  const issues: Issue[] = [];
  const sheets = summariseSheets(wb);
  const ds: NormalisedDataset = {
    frameworks: [], requirements: [], citations: [], requirementCitations: [], controls: [], mappings: [],
    testProcedures: [], evidence: [], frameworkReferences: [], reviews: [], procedureLinks: [], controlObligations: [],
  };

  for (const s of sheets) {
    if (s.missingRequired.length)
      issues.push({ severity: "ERROR", code: "MISSING_COLUMNS", sheet: s.name, message: `Missing required column(s): ${s.missingRequired.join(", ")}` });
    if (s.role === "UNRECOGNISED")
      issues.push({ severity: "INFO", code: "SHEET_NOT_IMPORTED", sheet: s.name, message: "Worksheet is not part of the CCF workbook model and was not imported." });
  }
  for (const required of Object.keys(REQUIRED))
    if (!wb.sheets.has(required)) issues.push({ severity: "ERROR", code: "MISSING_SHEET", sheet: required, message: `Worksheet "${required}" not found.` });
  if (issues.some((i) => i.severity === "ERROR")) return { dataset: ds, issues, sheets, counts: {} };

  // --- Sources -------------------------------------------------------------
  const srcSheet = wb.sheets.get(SHEETS.sources)!;
  const rs = reader(srcSheet);
  const frameworkBySourceId = new Map<string, string>();
  for (const { rowNumber, values } of srcSheet.rows) {
    const sourceId = rs.get(values, "Source ID");
    const name = rs.get(values, "Source Name");
    if (!sourceId || !name) {
      issues.push({ severity: "ERROR", code: "MISSING_VALUE", sheet: srcSheet.name, row: rowNumber, message: "Source ID or Source Name is empty." });
      continue;
    }
    if (frameworkBySourceId.has(sourceId)) {
      issues.push({ severity: "ERROR", code: "DUPLICATE_KEY", sheet: srcSheet.name, row: rowNumber, column: "Source ID", message: `Duplicate Source ID ${sourceId}.` });
      continue;
    }
    const fid = id();
    frameworkBySourceId.set(sourceId, fid);
    ds.frameworks.push({
      id: fid, sourceId, name,
      description: rs.get(values, "Description"), group: rs.get(values, "Group"), type: rs.get(values, "Type"),
      jurisdiction: rs.get(values, "Jurisdiction"), licensing: rs.get(values, "Licensing"), documentUrl: rs.get(values, "Document URL"),
      prioritizedByGsk: asBool(rs.get(values, "Prioritized by GSK?")) ?? false,
      versionLabel: deriveVersion(name), family: deriveFamily(name),
      raw: values, sourceSheet: srcSheet.name, sourceRow: rowNumber,
    });
  }

  // --- Integrated requirements -------------------------------------------------
  const irSheet = wb.sheets.get(SHEETS.requirements)!;
  const ri = reader(irSheet);
  const reqByRequirementId = new Map<string, NormalisedDataset["requirements"][number]>();
  for (const { rowNumber, values } of irSheet.rows) {
    const requirementId = ri.get(values, "Requirement ID");
    if (!requirementId) {
      issues.push({ severity: "ERROR", code: "MISSING_VALUE", sheet: irSheet.name, row: rowNumber, column: "Requirement ID", message: "Requirement ID is empty." });
      continue;
    }
    if (reqByRequirementId.has(requirementId)) {
      issues.push({ severity: "ERROR", code: "DUPLICATE_KEY", sheet: irSheet.name, row: rowNumber, column: "Requirement ID", message: `Duplicate Requirement ID ${requirementId}.` });
      continue;
    }
    const count = ri.get(values, "Count in CCF v2 Mapping?");
    const rec = {
      id: id(), requirementId,
      riskTopic: ri.get(values, "Risk Topic"), name: ri.get(values, "Requirement Name"), riskStatement: ri.get(values, "Risk statement"),
      foundInPrioritized: asBool(ri.get(values, "Found in Prioritized Sources?")),
      statedCcfMappingCount: count !== null && /^\d+$/.test(count) ? Number(count) : null,
      controlObjective: ri.get(values, "Control objective"), class: ri.get(values, "Class"),
      raw: values, sourceSheet: irSheet.name, sourceRow: rowNumber,
    };
    reqByRequirementId.set(requirementId, rec);
    ds.requirements.push(rec);
  }

  // --- Citations ----------------------------------------------------------------
  const citSheet = wb.sheets.get(SHEETS.citations)!;
  const rc = reader(citSheet);
  const parentCol = rc.col("Parent Source ID", true);
  const textCol = citSheet.headers.find((h) => h.startsWith("(unlabelled column"));
  if (!parentCol) issues.push({ severity: "ERROR", code: "MISSING_COLUMNS", sheet: citSheet.name, message: 'Missing "Parent Source ID ..." column.' });
  if (textCol)
    issues.push({ severity: "INFO", code: "UNLABELLED_COLUMN", sheet: citSheet.name, column: textCol, message: `Column has no header but holds the full section text; imported as "section text".` });
  const seenSections = new Set<string>();
  for (const { rowNumber, values } of citSheet.rows) {
    const parent = parentCol ? clean(values[parentCol]) : null;
    const reqId = rc.get(values, "Requirement ID");
    const sectionId = rc.get(values, "Source Section ID");
    const sectionName = rc.get(values, "Source Section Name");
    if (!parent || !sectionId || !sectionName || !reqId) {
      issues.push({ severity: "ERROR", code: "MISSING_VALUE", sheet: citSheet.name, row: rowNumber, message: "Parent Source ID, Requirement ID, Source Section ID or Source Section Name is empty." });
      continue;
    }
    const frameworkId = frameworkBySourceId.get(parent);
    if (!frameworkId) {
      issues.push({ severity: "ERROR", code: "UNKNOWN_SOURCE", sheet: citSheet.name, row: rowNumber, column: parentCol, message: `Parent Source ID ${parent} is not in "${SHEETS.sources}".` });
      continue;
    }
    const req = reqByRequirementId.get(reqId);
    if (!req) {
      issues.push({ severity: "ERROR", code: "UNKNOWN_REQUIREMENT", sheet: citSheet.name, row: rowNumber, column: "Requirement ID", message: `Requirement ID ${reqId} is not in "${SHEETS.requirements}".` });
      continue;
    }
    if (seenSections.has(sectionId)) {
      // Same section cited by a second requirement: link only.
      const existing = ds.citations.find((c) => c.sourceSectionId === sectionId)!;
      ds.requirementCitations.push({ id: id(), citationId: existing.id, requirementId: req.id });
      continue;
    }
    seenSections.add(sectionId);
    const cid = id();
    ds.citations.push({
      id: cid, sourceSectionId: sectionId, frameworkId, authSource: rc.get(values, "Auth. Source") ?? "", sectionName,
      sectionText: textCol ? clean(values[textCol]) : null, raw: values, sourceSheet: citSheet.name, sourceRow: rowNumber,
    });
    ds.requirementCitations.push({ id: id(), citationId: cid, requirementId: req.id });
  }

  // --- CCF controls -------------------------------------------------------------
  const ctlSheet = wb.sheets.get(SHEETS.controls)!;
  const wkSheet = wb.sheets.get(SHEETS.controlsWorking)!;
  const rk = reader(ctlSheet);
  const rw = reader(wkSheet);
  const nameCol = rk.col("New Common Control Name")!;
  const workingByName = new Map(wkSheet.rows.map((r) => [clean(r.values[rw.col("New Common Control Name")!]), r]));
  const primaryCountByReq = new Map<string, number>();
  const seenControls = new Set<string>();

  for (const { rowNumber, values } of ctlSheet.rows) {
    const controlName = clean(values[nameCol]);
    if (!controlName) {
      issues.push({ severity: "ERROR", code: "MISSING_VALUE", sheet: ctlSheet.name, row: rowNumber, column: nameCol, message: "Control name is empty." });
      continue;
    }
    if (seenControls.has(controlName)) {
      issues.push({ severity: "ERROR", code: "DUPLICATE_KEY", sheet: ctlSheet.name, row: rowNumber, column: nameCol, message: `Duplicate control ${controlName}.` });
      continue;
    }
    seenControls.add(controlName);
    const working = workingByName.get(controlName);
    if (!working)
      issues.push({ severity: "WARNING", code: "WORKING_ROW_MISSING", sheet: wkSheet.name, message: `${controlName} has no row on the working sheet.` });
    const w = working?.values;
    const cid = id();
    ds.controls.push({
      id: cid, controlName, domainPrefix: controlName.replace(/-d+$/, ""),
      ...controlFields((h) => rk.get(values, h)),
      gskReviewStatus: w ? rw.get(w, "GSK Ready for Review?") : null, gskApproval: w ? rw.get(w, "GSK Approved OR To Discuss") : null,
      raw: values, workingRaw: w ?? null, sourceSheet: ctlSheet.name, sourceRow: rowNumber,
    });

    // Mappings — authoritative sheet, then working sheet (kept separately, never merged).
    const addMappings = (row: RawRow, r: ReturnType<typeof reader>, sheet: ParsedSheet, authoritative: boolean, srcRow: number) => {
      for (const [column, type] of [["ARC Mapping", "PRIMARY"], ["Secondary ArC Mapping", "SECONDARY"]] as const) {
        const rawValue = r.get(row, column);
        if (!rawValue) {
          if (type === "PRIMARY" && authoritative)
            issues.push({ severity: "WARNING", code: "MISSING_MAPPING", sheet: sheet.name, row: srcRow, column, message: `${controlName} has no primary ArC mapping.` });
          continue;
        }
        const req = isReqId(rawValue) ? reqByRequirementId.get(rawValue) : undefined;
        if (authoritative && !req)
          issues.push({
            severity: "WARNING", code: "UNRESOLVED_MAPPING", sheet: sheet.name, row: srcRow, column,
            message: `${controlName}: "${rawValue.slice(0, 120)}" is not a Requirement ID; kept as text, not linked.`,
          });
        if (authoritative && req && type === "PRIMARY") primaryCountByReq.set(rawValue, (primaryCountByReq.get(rawValue) ?? 0) + 1);
        ds.mappings.push({
          id: id(), controlId: cid, requirementId: req?.id ?? null, mappingType: type, rawValue, authoritative,
          sourceSheet: sheet.name, sourceColumn: r.col(column)!,
        });
      }
    };
    addMappings(values, rk, ctlSheet, true, rowNumber);
    if (w) {
      addMappings(w, rw, wkSheet, false, working!.rowNumber);
      const a = rk.get(values, "ARC Mapping"), b = rw.get(w, "ARC Mapping");
      if (a !== b)
        issues.push({
          severity: "WARNING", code: "SHEET_MAPPING_CONFLICT", sheet: wkSheet.name, row: working!.rowNumber, column: "ARC Mapping",
          message: `${controlName}: working sheet maps to IR ${b ?? "—"}, authoritative sheet maps to IR ${a ?? "—"}. Authoritative value used.`,
        });
    }

    // Test procedures & evidence: each original column becomes its own typed record.
    const tp: [ParsedSheet, ReturnType<typeof reader>, RawRow | undefined, string, string][] = [
      [ctlSheet, rk, values, "Test Procedures", "CCF_V2"],
      [ctlSheet, rk, values, "ArC Test Procedures without Citations", "ARC_WITHOUT_CITATIONS"],
      [ctlSheet, rk, values, "ArC Test Procedures with Citations", "ARC_WITH_CITATIONS"],
      [wkSheet, rw, w, "Test Procedures (CCF V1)", "CCF_V1"],
    ];
    for (const [sheet, r, row, column, kind] of tp) {
      const text = row ? r.get(row, column) : null;
      if (!isPlaceholder(text)) ds.testProcedures.push({ id: id(), controlId: cid, kind, text: text!, sourceSheet: sheet.name, sourceColumn: r.col(column)! });
    }
    const ev: [ParsedSheet, ReturnType<typeof reader>, RawRow | undefined, string, string][] = [
      [ctlSheet, rk, values, "Recommended Evidences (Go-live)", "GO_LIVE"],
      [wkSheet, rw, w, "Recommended Evidences (CCFv1.0)", "CCF_V1"],
      [wkSheet, rw, w, "Recommended Evidences Updated (CCFv1.0)", "CCF_V1_UPDATED"],
    ];
    for (const [sheet, r, row, column, kind] of ev) {
      const text = row ? r.get(row, column) : null;
      if (!isPlaceholder(text)) ds.evidence.push({ id: id(), controlId: cid, kind, text: text!, sourceSheet: sheet.name, sourceColumn: r.col(column)! });
    }
    if (w) {
      for (const column of CROSSWALK_COLUMNS) {
        const v = rw.get(w, column);
        if (isPlaceholder(v)) continue;
        const tokens = v!.split(/[,;\n]+/).map((t) => t.trim()).filter((t) => t && !isPlaceholder(t));
        ds.frameworkReferences.push({ id: id(), controlId: cid, columnName: rw.col(column)!, referenceRaw: v!, tokens, sourceSheet: wkSheet.name });
      }
    }
  }

  // Working-sheet duplicate identifiers (column only exists there).
  const ciCol = rw.col("Control Identifier");
  if (ciCol) {
    const counts = new Map<string, number[]>();
    for (const r of wkSheet.rows) {
      const v = clean(r.values[ciCol]);
      if (v) counts.set(v, [...(counts.get(v) ?? []), r.rowNumber]);
    }
    for (const [v, rows] of counts)
      if (rows.length > 1)
        issues.push({ severity: "WARNING", code: "DUPLICATE_VALUE", sheet: wkSheet.name, column: ciCol, row: rows[0], message: `Control Identifier ${v} appears on rows ${rows.join(", ")}.` });
  }

  // Rare categorical values (likely data-entry variants), authoritative control sheet.
  for (const h of ctlSheet.headers) {
    const vals = ctlSheet.rows.map((r) => r.values[h]).filter((v): v is string => v !== null);
    const freq = new Map<string, number>();
    vals.forEach((v) => freq.set(v, (freq.get(v) ?? 0) + 1));
    if (vals.length < 100 || freq.size > 10 || freq.size < 2) continue;
    for (const [v, n] of freq)
      if (n === 1) {
        const row = ctlSheet.rows.find((r) => r.values[h] === v)!;
        issues.push({ severity: "INFO", code: "RARE_VALUE", sheet: ctlSheet.name, column: h, row: row.rowNumber, message: `Value "${v.replace(/\n/g, "↵")}" is used once in this column — possible variant spelling or entry error.` });
      }
  }

  // Stated mapping counts vs authoritative mappings.
  for (const r of ds.requirements) {
    const actual = primaryCountByReq.get(r.requirementId) ?? 0;
    if (r.statedCcfMappingCount !== null && r.statedCcfMappingCount !== actual)
      issues.push({ severity: "WARNING", code: "COUNT_MISMATCH", sheet: irSheet.name, row: r.sourceRow, column: "Count in CCF v2 Mapping?", message: `IR ${r.requirementId}: stated count ${r.statedCcfMappingCount}, authoritative primary mappings ${actual}.` });
  }
  const metSheet = wb.sheets.get(SHEETS.metrics)!;
  const rm = reader(metSheet);
  let metricMismatch = 0;
  for (const { rowNumber, values } of metSheet.rows) {
    const rid = rm.get(values, "Requirement ID");
    const stated = rm.get(values, "ArC Mapping Count");
    if (rid && stated !== null && Number(stated) !== (primaryCountByReq.get(rid) ?? 0)) {
      metricMismatch++;
      issues.push({ severity: "WARNING", code: "COUNT_MISMATCH", sheet: metSheet.name, row: rowNumber, message: `IR ${rid}: "ArC Mapping Count" ${stated} ≠ authoritative ${primaryCountByReq.get(rid) ?? 0}.` });
    }
  }
  if (!metricMismatch)
    issues.push({ severity: "INFO", code: "CHECK_PASSED", sheet: metSheet.name, message: `All ${metSheet.rows.length} "ArC Mapping Count" values agree with the authoritative control sheet.` });

  // --- Unmapped IR review sheets --------------------------------------------------
  const unmappedSheets = wb.sheetNames.filter((n) => sheetRole(n) === "UNMAPPED_REVIEW");
  for (const name of unmappedSheets) {
    const s = wb.sheets.get(name)!;
    const ru = reader(s);
    for (const { rowNumber, values } of s.rows) {
      const irId = ru.get(values, "IR ID");
      const req = irId ? reqByRequirementId.get(irId) : undefined;
      if (!req) {
        issues.push({ severity: "WARNING", code: "UNKNOWN_REQUIREMENT", sheet: name, row: rowNumber, column: "IR ID", message: `IR ID ${irId ?? "(empty)"} not found in "${SHEETS.requirements}".` });
        continue;
      }
      if (primaryCountByReq.get(irId!))
        issues.push({ severity: "INFO", code: "REVIEW_NOW_MAPPED", sheet: name, row: rowNumber, message: `IR ${irId} is listed as unmapped but now has an authoritative CCF mapping.` });
      ds.reviews.push({ id: id(), requirementId: req.id, sheetName: name, raw: values, sourceRow: rowNumber });
    }
  }

  // Header-less IR list ("Sheet1") — validated against the review sheets, not stored.
  const list = wb.sheets.get(SHEETS.irList);
  if (list) {
    const ids = list.rows.map((r) => clean(Object.values(r.values)[0])).filter(Boolean) as string[];
    const missing = ids.filter((i) => !reqByRequirementId.has(i));
    issues.push({
      severity: missing.length ? "WARNING" : "INFO", code: "IR_LIST_CHECK", sheet: SHEETS.irList,
      message: `Header-less list of ${ids.length} IR IDs` + (missing.length ? `; ${missing.length} not found in IR reference.` : "; all found in IR reference (matches the unmapped review set)."),
    });
  }

  // Prioritised IRs without any authoritative CCF mapping (informational).
  const unmapped = ds.requirements.filter((r) => r.foundInPrioritized && !primaryCountByReq.get(r.requirementId)).length;
  issues.push({ severity: "INFO", code: "UNMAPPED_REQUIREMENTS", sheet: SHEETS.requirements, message: `${unmapped} IRs found in prioritised sources have no authoritative CCF control mapping.` });

  // Resolve control -> obligation links from the authoritative mapping columns (primary wins over secondary).
  const citationsByRequirement = new Map<string, string[]>();
  for (const rc of ds.requirementCitations) citationsByRequirement.set(rc.requirementId, [...(citationsByRequirement.get(rc.requirementId) ?? []), rc.citationId]);
  const links = new Map<string, NormalisedDataset["controlObligations"][number]>();
  for (const m of ds.mappings.filter((x) => x.authoritative && x.requirementId).sort((a, b) => (a.mappingType === b.mappingType ? 0 : a.mappingType === "PRIMARY" ? -1 : 1))) {
    for (const citationId of citationsByRequirement.get(m.requirementId!) ?? []) {
      const key = `${m.controlId}|${citationId}`;
      if (!links.has(key)) links.set(key, { id: id(), controlId: m.controlId, citationId, mappingType: m.mappingType });
    }
  }
  ds.controlObligations = [...links.values()];

  const counts = {
    frameworks: ds.frameworks.length,
    citations: ds.citations.length,
    citationLinks: ds.requirementCitations.length,
    requirements: ds.requirements.length,
    controls: ds.controls.length,
    mappings: ds.mappings.length,
    authoritativeMappings: ds.mappings.filter((m) => m.authoritative).length,
    testProcedures: ds.testProcedures.length,
    evidence: ds.evidence.length,
    frameworkReferences: ds.frameworkReferences.length,
    reviews: ds.reviews.length,
    controlObligations: ds.controlObligations.length,
  };
  return { dataset: ds, issues, sheets, counts };
}

