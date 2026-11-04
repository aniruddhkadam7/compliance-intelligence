// Source-ID workbook: obligations keyed by Parent Source ID / Source Section ID, and client
// controls mapped through test procedures to those Source Section IDs.
//
//   "Citation Sources"           Parent Source ID | Authoritative Source | Source Section ID | Source Section Name | Source Section Description
//   "Control Framework (CCF)"    the full control register (imported when present)
//   "CCFv2"                      the client's selection of controls (same columns); the register when there is no
//                                full register sheet
//   mapping sheet                Control ID | Test Procedure ID | Test Procedure | Source Section ID (one or more) | Source Section Name
//   "Authoritative Sources"      framework list (checked against the citation sheet)
//   "ArC Parent Sources (Metadata)"  optional framework metadata (type, group, jurisdiction, URL, applicability), matched by name
//
// Pure functions: no database access.

import { clean, findHeader, type ParsedSheet, type ParsedWorkbook, type RawRow } from "./parse";
import {
  controlFields, id, isPlaceholder, reader, summariseSheets,
  type Issue, type NormalisedDataset, type NormaliseResult, type SheetRole, type SheetSummary,
} from "./ccf-workbook";
import { deriveFamily, deriveVersion } from "@/lib/frameworks";

export const SOURCE_ID_SHEETS = {
  obligations: "Citation Sources",
  controls: "CCFv2",
  register: "Control Framework (CCF)",
  sourceList: "Authoritative Sources",
  sourceMetadata: "ArC Parent Sources (Metadata)",
} as const;

const OBLIGATION_COLUMNS = ["Parent Source ID", "Authoritative Source", "Source Section ID", "Source Section Name"];
const MAPPING_COLUMNS = ["Control ID", "Test Procedure ID", "Source Section ID"];

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const hasColumns = (sheet: ParsedSheet | undefined, cols: string[]) => !!sheet && cols.every((c) => findHeader(sheet, c));

/** The sheet that maps test procedures to Source Section IDs (named "Metrics(Hidden)" in the current file). */
function mappingSheet(wb: ParsedWorkbook) {
  return wb.sheetNames.map((n) => wb.sheets.get(n)!).find((s) => hasColumns(s, MAPPING_COLUMNS));
}

/**
 * The control register: the full "Control Framework (CCF)" sheet when present, else "CCFv2", else any sheet with a
 * control-name column (working "(Metadata)" copies excluded). Every control is imported; the client chooses its scope.
 */
function controlSheet(wb: ParsedWorkbook) {
  const named = (n: string) => { const sh = wb.sheets.get(n); return sh && hasColumns(sh, ["New Common Control Name"]) ? sh : undefined; };
  return named(SOURCE_ID_SHEETS.register) ?? named(SOURCE_ID_SHEETS.controls)
    ?? wb.sheetNames.filter((n) => !/\(metadata\)/i.test(n)).map((n) => wb.sheets.get(n)!).find((sh) => hasColumns(sh, ["New Common Control Name"]));
}

/** The client's selection ("CCFv2") when the full register is imported from another sheet. */
function selectionSheet(wb: ParsedWorkbook, register: ParsedSheet | undefined) {
  const sh = wb.sheets.get(SOURCE_ID_SHEETS.controls);
  return sh && register && sh.name !== register.name && hasColumns(sh, ["New Common Control Name"]) ? sh : undefined;
}

/** Workbook contains a document library ("Citation Sources"). */
export const hasLibrary = (wb: ParsedWorkbook) => hasColumns(wb.sheets.get(SOURCE_ID_SHEETS.obligations), OBLIGATION_COLUMNS);
/** Workbook contains client controls mapped to Source Section IDs. */
export const hasClientControls = (wb: ParsedWorkbook) => !!controlSheet(wb) && !!mappingSheet(wb);

/**
 * library:  the document library (frameworks + obligations) from "Citation Sources".
 * controls: client controls and test procedures, with Source Section IDs resolved through `sectionLookup`
 *           (Source Section ID -> existing obligation id in the library).
 */
export function normaliseSourceIdWorkbook(wb: ParsedWorkbook, mode: "library" | "controls", sectionLookup: Map<string, string> = new Map()): NormaliseResult {
  const issues: Issue[] = [];
  const ds: NormalisedDataset = {
    frameworks: [], requirements: [], citations: [], requirementCitations: [], controls: [], mappings: [],
    testProcedures: [], evidence: [], frameworkReferences: [], reviews: [], procedureLinks: [], controlObligations: [],
  };
  const obSheet = wb.sheets.get(SOURCE_ID_SHEETS.obligations);
  const mapSheet = mappingSheet(wb);
  const ctlSheet = controlSheet(wb);
  const selSheet = selectionSheet(wb, ctlSheet);

  const roleOf = (name: string): SheetRole =>
    name === obSheet?.name ? "CITATIONS"
      : name === mapSheet?.name ? "PROCEDURE_MAP"
      : name === ctlSheet?.name ? "CONTROLS"
      : name === selSheet?.name ? "CONTROLS_SELECTION"
      : name === SOURCE_ID_SHEETS.sourceList ? "SOURCE_LIST"
      : name === SOURCE_ID_SHEETS.sourceMetadata ? "SOURCE_METADATA"
      : "UNRECOGNISED";
  const required: Partial<Record<SheetRole, string[]>> =
    mode === "library" ? { CITATIONS: OBLIGATION_COLUMNS } : { PROCEDURE_MAP: MAPPING_COLUMNS, CONTROLS: ["New Common Control Name"] };
  const sheets: SheetSummary[] = summariseSheets(wb).map((s) => {
    const role = roleOf(s.name);
    const sheet = wb.sheets.get(s.name)!;
    return { ...s, role, missingRequired: (required[role] ?? []).filter((c) => !findHeader(sheet, c)) };
  });
  if (mode === "library" && !obSheet)
    issues.push({ severity: "ERROR", code: "MISSING_SHEET", sheet: SOURCE_ID_SHEETS.obligations, message: `Worksheet "${SOURCE_ID_SHEETS.obligations}" with the obligations was not found.` });
  if (mode === "controls" && !ctlSheet)
    issues.push({ severity: "ERROR", code: "MISSING_SHEET", message: "No worksheet with a “New Common Control Name” column (the client controls) was found." });
  if (mode === "controls" && !mapSheet)
    issues.push({ severity: "ERROR", code: "MISSING_SHEET", message: "No worksheet with Control ID, Test Procedure ID and Source Section ID columns was found." });
  if (mode === "controls" && sectionLookup.size === 0)
    issues.push({ severity: "ERROR", code: "LIBRARY_EMPTY", message: "The document library is empty. Import the library before importing client controls." });
  for (const s of sheets) {
    if (s.missingRequired.length) issues.push({ severity: "ERROR", code: "MISSING_COLUMNS", sheet: s.name, message: `Missing required column(s): ${s.missingRequired.join(", ")}` });
    if (s.role === "UNRECOGNISED" || (mode === "library" && (s.role === "CONTROLS" || s.role === "PROCEDURE_MAP")) || (mode === "controls" && ["CITATIONS", "SOURCE_LIST", "SOURCE_METADATA"].includes(s.role))) issues.push({ severity: "INFO", code: "SHEET_NOT_IMPORTED", sheet: s.name, message: mode === "library" ? "Worksheet is not used by the library import." : "Worksheet is not used by the client control import." });
  }
  if (issues.some((i) => i.severity === "ERROR")) return { dataset: ds, issues, sheets, counts: {} };

  if (mode === "library") {
    // --- Framework metadata (optional), matched by full source name --------------
    const meta = new Map<string, RawRow>();
    const metaSheet = wb.sheets.get(SOURCE_ID_SHEETS.sourceMetadata);
    if (metaSheet) {
      const rm = reader(metaSheet);
      for (const { values } of metaSheet.rows) {
        const name = rm.get(values, "Source Name");
        if (name) meta.set(norm(name), values);
      }
    }

    // --- Obligations and frameworks -------------------------------------------------
    const ro = reader(obSheet!);
    const frameworkByParent = new Map<string, NormalisedDataset["frameworks"][number]>();
    const namesByParent = new Map<string, Set<string>>();
    const citationBySection = new Map<string, string>();
    const missingIds = new Map<string, { note: string; count: number; firstRow: number }>();
    let badPrefix = 0;

    for (const { rowNumber, values } of obSheet!.rows) {
      const parent = ro.get(values, "Parent Source ID");
      const source = ro.get(values, "Authoritative Source");
      const sectionId = ro.get(values, "Source Section ID");
      const sectionName = ro.get(values, "Source Section Name");
      if (!parent || !source || !sectionName) {
        issues.push({ severity: "ERROR", code: "MISSING_VALUE", sheet: obSheet!.name, row: rowNumber, message: "Parent Source ID, Authoritative Source or Source Section Name is empty." });
        continue;
      }
      namesByParent.set(parent, (namesByParent.get(parent) ?? new Set()).add(source));
      let fw = frameworkByParent.get(parent);
      if (!fw) {
        const m = meta.get(norm(source));
        const mr = metaSheet && m ? reader(metaSheet) : null;
        const g = (h: string) => (mr && m ? mr.get(m, h) : null);
        fw = {
          id: id(), sourceId: parent, name: source,
          description: g("Description"), group: g("Group"), type: g("Type"), jurisdiction: g("Jurisdiction"), licensing: g("Licensing"),
          documentUrl: g("Document URL"), applicability: g("IT/OT/AI Applicability") ?? g("Applicability"), prioritizedByGsk: m ? /^y(es)?$/i.test(g("Prioritized by GSK?") ?? "") : false,
          versionLabel: deriveVersion(source), family: deriveFamily(source),
          raw: { "Parent Source ID": parent, "Authoritative Source": source }, sourceSheet: obSheet!.name, sourceRow: rowNumber,
        };
        frameworkByParent.set(parent, fw);
        ds.frameworks.push(fw);
      }
      // Section IDs must be numeric; the current file writes a note instead of an ID for large frameworks.
      if (!sectionId || !/^\d+$/.test(sectionId)) {
        const e = missingIds.get(parent) ?? { note: sectionId ?? "(empty)", count: 0, firstRow: rowNumber };
        e.count++;
        missingIds.set(parent, e);
        continue;
      }
      if (citationBySection.has(sectionId)) {
        issues.push({ severity: "WARNING", code: "DUPLICATE_KEY", sheet: obSheet!.name, row: rowNumber, column: "Source Section ID", message: `Source Section ID ${sectionId} appears more than once; first occurrence kept.` });
        continue;
      }
      if (!sectionId.startsWith(parent)) badPrefix++;
      const cid = id();
      citationBySection.set(sectionId, cid);
      ds.citations.push({
        id: cid, sourceSectionId: sectionId, frameworkId: fw.id, authSource: source, sectionName,
        sectionText: ro.get(values, "Source Section Description"), raw: values, sourceSheet: obSheet!.name, sourceRow: rowNumber,
      });
    }
    for (const [parent, e] of missingIds) {
      const fw = frameworkByParent.get(parent)!;
      issues.push({
        severity: "WARNING", code: "MISSING_SECTION_ID", sheet: obSheet!.name, row: e.firstRow, column: "Source Section ID",
        message: `${e.count} obligations of ${fw.name} (Parent Source ID ${parent}) have no Source Section ID (“${e.note}”) and were not imported.`,
      });
    }
    if (badPrefix)
      issues.push({ severity: "WARNING", code: "ID_CONVENTION", sheet: obSheet!.name, column: "Source Section ID", message: `${badPrefix} Source Section IDs do not start with their Parent Source ID.` });
    for (const [parent, names] of namesByParent)
      if (names.size > 1)
        issues.push({ severity: "WARNING", code: "ID_CONVENTION", sheet: obSheet!.name, message: `Parent Source ID ${parent} is used for ${names.size} different sources: ${[...names].join(" | ")}.` });
    for (const fw of ds.frameworks)
      if (metaSheet && !meta.has(norm(fw.name)))
        issues.push({ severity: "INFO", code: "METADATA_NOT_FOUND", sheet: SOURCE_ID_SHEETS.sourceMetadata, message: `No metadata row for “${fw.name}”; category, jurisdiction and URL are left empty.` });

    // Cross-check the framework list against the obligations sheet.
    const listSheet = wb.sheets.get(SOURCE_ID_SHEETS.sourceList);
    if (listSheet) {
      const fullCol = listSheet.headers.find((h) => h === "Authoritative Source ") ?? findHeader(listSheet, "Authoritative Source");
      const shortCol = findHeader(listSheet, "Authoritative Source");
      const parentCol = findHeader(listSheet, "Parent Source ID");
      // Words of the short name that should appear in the full name (generic family words excluded).
      const GENERIC = new Set(["nist", "iso", "iec", "eu", "of", "the", "and", "rev", "standard"]);
      const words = (t: string) => t.toLowerCase().replace(/[()]/g, " ").split(/[\s/,:–-]+/).filter((w) => w.length > 1 && !GENERIC.has(w));
      for (const { rowNumber, values } of listSheet.rows) {
        const parent = parentCol ? clean(values[parentCol]) : null;
        const full = fullCol ? clean(values[fullCol]) : null;
        if (!parent || !/^\d+$/.test(parent) || !full) continue;
        const short = shortCol && shortCol !== fullCol ? clean(values[shortCol]) : null;
        if (short) {
          const w = words(short);
          const fullText = full.toLowerCase();
          if (w.length && w.filter((x) => fullText.includes(x)).length / w.length < 0.5)
            issues.push({
              severity: "WARNING", code: "SOURCE_LIST_MISMATCH", sheet: listSheet.name, row: rowNumber, column: shortCol,
              message: `Short name “${short}” does not match the full name “${full}” (Parent Source ID ${parent}). The full name and ID are used.`,
            });
        }
        const used = frameworkByParent.get(parent)?.name;
        if (used && norm(used) !== norm(full))
          issues.push({
            severity: "WARNING", code: "SOURCE_LIST_MISMATCH", sheet: listSheet.name, row: rowNumber, column: parentCol,
            message: `Parent Source ID ${parent} is listed as “${full}”${shortCol && shortCol !== fullCol ? ` (short name “${clean(values[shortCol])}”)` : ""}, but the obligations use it for “${used}”. The obligations sheet is used.`,
          });
      }
    }

  } else {
    const citationBySection = sectionLookup;
    const ctlSheet_ = ctlSheet!;
    const mapSheet_ = mapSheet!;
    // --- Controls -----------------------------------------------------------------------
    const rc = reader(ctlSheet_);
    const nameCol = rc.col("New Common Control Name")!;
    const controlByName = new Map<string, string>();
    const selection = new Set<string>();
    if (selSheet) { const rs = reader(selSheet); for (const { values } of selSheet.rows) { const n = clean(values[rs.col("New Common Control Name")!]); if (n) selection.add(n); } }
    for (const { rowNumber, values } of ctlSheet_.rows) {
      const controlName = clean(values[nameCol]);
      if (!controlName) continue;
      if (controlByName.has(controlName)) {
        issues.push({ severity: "ERROR", code: "DUPLICATE_KEY", sheet: ctlSheet_.name, row: rowNumber, column: nameCol, message: `Duplicate control ${controlName}.` });
        continue;
      }
      const cid = id();
      controlByName.set(controlName, cid);
      ds.controls.push({
        id: cid, controlName, domainPrefix: controlName.replace(/-\d+$/, ""),
        ...controlFields((h) => rc.get(values, h)),
        gskReviewStatus: null, gskApproval: null, inScope: true, inClientSelection: selection.has(controlName),
        raw: values, workingRaw: null, sourceSheet: ctlSheet_.name, sourceRow: rowNumber,
      });
      for (const [column, kind] of [["Test Procedures", "CCF_V2"]] as const) {
        const text = rc.get(values, column);
        if (!isPlaceholder(text)) ds.testProcedures.push({ id: id(), controlId: cid, kind, text: text!, sourceSheet: ctlSheet_.name, sourceColumn: rc.col(column)! });
      }
      const ev = rc.get(values, "Recommended Evidences (Go-live)");
      if (!isPlaceholder(ev)) ds.evidence.push({ id: id(), controlId: cid, kind: "GO_LIVE", text: ev!, sourceSheet: ctlSheet_.name, sourceColumn: rc.col("Recommended Evidences (Go-live)")! });
    }

    // --- Test procedures -> obligations --------------------------------------------------
    const rmp = reader(mapSheet_);
    const obligationKey = new Set<string>();
    // Every "Source Section ID" column (e.g. "Source Section ID (2)" holds the same mapping for a newer version).
    const sectionColumns = mapSheet_.headers.filter((h) => /^source section id\b/i.test(h.trim()));
    const outside = new Map<string, number>(); // control -> test procedures, for controls not in the register
    for (const { rowNumber, values } of mapSheet_.rows) {
      const controlName = rmp.get(values, "Control ID");
      const procedureId = rmp.get(values, "Test Procedure ID");
      if (!controlName || !procedureId) continue;
      const controlId = controlByName.get(controlName);
      if (!controlId) {
        outside.set(controlName, (outside.get(controlName) ?? 0) + 1);
        continue;
      }
      const tpId = id();
      ds.testProcedures.push({
        id: tpId, controlId, kind: "PROCEDURE", procedureId, text: rmp.get(values, "Test Procedure") ?? procedureId,
        sourceSheet: mapSheet_.name, sourceColumn: rmp.col("Test Procedure") ?? "Test Procedure",
      });
      const cell = sectionColumns.map((h) => clean(values[h]) ?? "").join(" ").trim();
      const tokens = cell.split(/[\s,;:]+/).filter(Boolean);
      if (!tokens.some((t) => /^\d+$/.test(t))) {
        issues.push({ severity: "INFO", code: "PROCEDURE_UNMAPPED", sheet: mapSheet_.name, row: rowNumber, column: "Source Section ID", message: `${procedureId} has no mapped obligation${cell ? ` (“${cell}”)` : ""}.` });
        continue;
      }
      for (const t of [...new Set(tokens.filter((x) => /^\d+$/.test(x)))]) {
        const citationId = citationBySection.get(t);
        if (!citationId) {
          issues.push({ severity: "WARNING", code: "UNKNOWN_SECTION_ID", sheet: mapSheet_.name, row: rowNumber, column: "Source Section ID", message: `${procedureId}: Source Section ID ${t} is not in the document library.` });
          continue;
        }
        ds.procedureLinks.push({ id: id(), testProcedureId: tpId, citationId });
        const key = `${controlId}|${citationId}`;
        if (!obligationKey.has(key)) {
          obligationKey.add(key);
          ds.controlObligations.push({ id: id(), controlId, citationId, mappingType: "PROCEDURE" });
        }
      }
    }
    if (selSheet)
      issues.push({
        severity: "INFO", code: "CONTROL_REGISTER", sheet: ctlSheet_.name,
        message: `All ${ds.controls.length} controls on “${ctlSheet_.name}” are imported and in scope; the ${selection.size} listed on “${selSheet.name}” are marked as the client's selection. The client can change the scope on Client Control Mapping.`,
      });
    if (outside.size)
      issues.push({
        severity: "INFO", code: "CONTROLS_OUTSIDE_REGISTER", sheet: mapSheet_.name,
        message: `${[...outside.values()].reduce((n, v) => n + v, 0)} test procedures belong to ${outside.size} controls that are not in the client register (“${ctlSheet_.name}”) and were not imported: ${[...outside.keys()].slice(0, 12).join(", ")}${outside.size > 12 ? "…" : ""}.`,
      });
    const unmappedControls = ds.controls.filter((c) => !ds.controlObligations.some((o) => o.controlId === c.id));
    if (unmappedControls.length)
      issues.push({ severity: "INFO", code: "UNMAPPED_CONTROLS", sheet: mapSheet_.name, message: `${unmappedControls.length} control(s) have no mapped obligation: ${unmappedControls.map((c) => c.controlName).join(", ")}.` });

    issues.push({
      severity: "INFO", code: "MAPPING_SUMMARY", sheet: mapSheet_.name,
      message: `${ds.testProcedures.filter((t) => t.kind === "PROCEDURE").length} test procedures map ${ds.controls.length} controls to ${new Set(ds.controlObligations.map((o) => o.citationId)).size} obligations in the document library.`,
    });

  }

  const counts: Record<string, number> = mode === "library"
    ? { frameworks: ds.frameworks.length, citations: ds.citations.length }
    : {
        controls: ds.controls.length,
        testProcedures: ds.testProcedures.filter((t) => t.kind === "PROCEDURE").length,
        procedureLinks: ds.procedureLinks.length,
        controlObligations: ds.controlObligations.length,
        evidence: ds.evidence.length,
      };
  return { dataset: ds, issues, sheets, counts };
}
