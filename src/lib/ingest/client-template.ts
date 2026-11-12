// Custom control template: a simple workbook layout any client can fill in, its importer, and the ten
// clearly labelled sample controls used for demonstrations. Section IDs are resolved against the library;
// anything that does not resolve is reported, never guessed.
import * as XLSX from "xlsx";
import type { ParsedWorkbook } from "./parse";
import { id, reader, summariseSheets, type Issue, type NormalisedDataset, type NormaliseResult } from "./ccf-workbook";

export const TEMPLATE_HEADERS = ["Client Control ID", "Control Name", "Control Description", "Test Procedure ID", "Test Procedure Description", "Relevant Framework", "Source ID / Section ID"] as const;
export const SAMPLE_PREFIX = "SAMPLE-";

export function isClientTemplate(wb: ParsedWorkbook) {
  return wb.sheetNames.some((n) => { const h = wb.sheets.get(n)!.headers.map((x) => x.trim().toLowerCase()); return h.includes("client control id") && h.some((x) => x.startsWith("source id")); });
}

/** One row per test procedure (or per control). Several Source IDs may be listed in one cell. */
export function normaliseClientTemplate(wb: ParsedWorkbook, lookup: Map<string, string>): NormaliseResult {
  const issues: Issue[] = [];
  const ds: NormalisedDataset = {
    frameworks: [], requirements: [], citations: [], requirementCitations: [], controls: [], mappings: [],
    testProcedures: [], evidence: [], frameworkReferences: [], reviews: [], procedureLinks: [], controlObligations: [],
  };
  const sheetName = wb.sheetNames.find((n) => wb.sheets.get(n)!.headers.some((h) => h.trim().toLowerCase() === "client control id"))!;
  const sheet = wb.sheets.get(sheetName)!;
  const r = reader(sheet);
  const sourceCol = sheet.headers.find((h) => h.trim().toLowerCase().startsWith("source id"))!;
  const controls = new Map<string, string>();
  const procedures = new Set<string>();
  const obligations = new Set<string>();
  for (const { rowNumber, values } of sheet.rows) {
    const cid = r.get(values, "Client Control ID");
    if (!cid) { if (Object.values(values).some(Boolean)) issues.push({ severity: "ERROR", code: "MISSING_VALUE", sheet: sheetName, row: rowNumber, column: "Client Control ID", message: "Row has no Client Control ID." }); continue; }
    if (/^example/i.test(cid)) continue; // the template's example row
    let controlId = controls.get(cid);
    if (!controlId) {
      controlId = id();
      controls.set(cid, controlId);
      ds.controls.push({
        id: controlId, controlName: cid, domainPrefix: cid.replace(/[-_ ]?\d+$/, "") || cid, title: r.get(values, "Control Name"), objective: r.get(values, "Control Description"),
        category: r.get(values, "Relevant Framework"), raw: values, sourceSheet: sheetName, sourceRow: rowNumber,
      });
    }
    const tpId = r.get(values, "Test Procedure ID");
    const tpText = r.get(values, "Test Procedure Description");
    let procedureRow: string | null = null;
    if (tpId && !procedures.has(tpId)) {
      procedureRow = id();
      procedures.add(tpId);
      ds.testProcedures.push({ id: procedureRow, controlId, kind: "PROCEDURE", procedureId: tpId, text: tpText ?? tpId, sourceSheet: sheetName, sourceColumn: "Test Procedure Description" });
    }
    for (const sid of (values[sourceCol] ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
      const citationId = lookup.get(sid);
      if (!citationId) { issues.push({ severity: "WARNING", code: "UNRESOLVED_SOURCE_ID", sheet: sheetName, row: rowNumber, column: sourceCol, message: `Source ID ${sid} is not in the document library; the mapping was not imported.` }); continue; }
      if (procedureRow) ds.procedureLinks.push({ id: id(), testProcedureId: procedureRow, citationId });
      const k = `${controlId}|${citationId}`;
      if (!obligations.has(k)) { obligations.add(k); ds.controlObligations.push({ id: id(), controlId, citationId, mappingType: tpId ? "PROCEDURE" : "PRIMARY" }); }
    }
  }
  if (!ds.controls.length) issues.push({ severity: "ERROR", code: "NO_CONTROLS", sheet: sheetName, message: "No custom controls were found in the template." });
  const sheets = summariseSheets(wb).map((s) => ({ ...s, role: (s.name === sheetName ? "CONTROLS" : s.role) as typeof s.role }));
  return { dataset: ds, issues, sheets, counts: { controls: ds.controls.length, testProcedures: ds.testProcedures.length, controlObligations: ds.controlObligations.length } };
}

type Row = (string | null)[];

/** The downloadable template, with an instructions sheet and one example row. */
export function buildTemplate(rows: Row[] = [["EXAMPLE-01", "Access reviews", "User access is reviewed quarterly.", "EXAMPLE-01:TP1", "Inspect the last quarterly access review and its approvals.", "NIST CSF 1.1", "202130"]]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], ...rows]);
  ws["!cols"] = [16, 30, 50, 18, 50, 20, 26].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, "Custom controls");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Custom control template"],
    ["One row per test procedure. Repeat the control columns for each of its test procedures."],
    ["Source ID / Section ID: one or more Source IDs from the platform's document library, separated by commas or spaces (see Sources)."],
    ["Rows whose Client Control ID starts with EXAMPLE are ignored. Unknown Source IDs are reported in the import preview and not imported."],
    ["Uploading replaces the client's current controls; the previous mapping is kept in the import history."],
  ]), "Instructions");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/**
 * Ten sample controls for demonstrations, labelled SAMPLE-. They are illustrative, not client data and not
 * validated mappings. Each lists the section identifiers it maps to; only those present in the library are used.
 */
export const SAMPLE_CONTROLS: { id: string; name: string; description: string; procedure: string; sections: { framework: string; ids: string[] }[] }[] = [
  { id: "SAMPLE-01", name: "User access reviews", description: "Access rights are reviewed periodically and revoked when no longer required.", procedure: "Inspect the latest periodic access review and confirm removals were actioned.", sections: [{ framework: "202", ids: ["PR.AC-1", "PR.AC-4"] }, { framework: "121", ids: ["6.1", "6.2"] }] },
  { id: "SAMPLE-02", name: "Multi-factor authentication", description: "Remote and privileged access requires multi-factor authentication.", procedure: "Inspect the identity provider policy and test a sample of privileged accounts.", sections: [{ framework: "202", ids: ["PR.AC-7"] }, { framework: "121", ids: ["6.3", "6.5"] }] },
  { id: "SAMPLE-03", name: "Vulnerability scanning", description: "Systems are scanned for vulnerabilities on a defined schedule and findings are tracked.", procedure: "Inspect recent scan reports and the remediation tracker.", sections: [{ framework: "202", ids: ["DE.CM-8", "ID.RA-1"] }, { framework: "121", ids: ["7.5", "7.6"] }] },
  { id: "SAMPLE-04", name: "Patch management", description: "Security patches are applied within defined timeframes based on risk.", procedure: "Compare a sample of systems' patch levels with the patch policy timeframes.", sections: [{ framework: "202", ids: ["PR.IP-12"] }, { framework: "121", ids: ["7.3", "7.4"] }] },
  { id: "SAMPLE-05", name: "Security event logging", description: "Security-relevant events are logged centrally and reviewed.", procedure: "Inspect log sources configured in the central log platform and evidence of review.", sections: [{ framework: "202", ids: ["PR.PT-1", "DE.CM-1"] }, { framework: "121", ids: ["8.2", "8.11"] }] },
  { id: "SAMPLE-06", name: "Incident response plan", description: "An incident response plan is maintained, tested and followed.", procedure: "Inspect the plan, its last test and a sample incident record.", sections: [{ framework: "202", ids: ["RS.RP-1", "PR.IP-9"] }, { framework: "121", ids: ["17.4"] }] },
  { id: "SAMPLE-07", name: "Backup and restore", description: "Critical data is backed up and restores are tested.", procedure: "Inspect backup job results and the latest restore test.", sections: [{ framework: "202", ids: ["PR.IP-4", "RC.RP-1"] }, { framework: "121", ids: ["11.2", "11.5"] }] },
  { id: "SAMPLE-08", name: "Asset inventory", description: "Hardware and software assets are inventoried and kept current.", procedure: "Reconcile a sample of discovered assets with the inventory.", sections: [{ framework: "202", ids: ["ID.AM-1", "ID.AM-2"] }, { framework: "121", ids: ["1.1", "2.1"] }] },
  { id: "SAMPLE-09", name: "Security awareness training", description: "Personnel complete security awareness training at onboarding and annually.", procedure: "Inspect training completion records for a sample of personnel.", sections: [{ framework: "202", ids: ["PR.AT-1"] }, { framework: "121", ids: ["14.1"] }] },
  { id: "SAMPLE-10", name: "Encryption of data", description: "Sensitive data is encrypted at rest and in transit.", procedure: "Inspect encryption settings for storage and external connections.", sections: [{ framework: "202", ids: ["PR.DS-1", "PR.DS-2"] }, { framework: "121", ids: ["3.10", "3.11"] }] },
];
