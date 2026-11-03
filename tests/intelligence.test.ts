// Unit tests for update detection, version relations, client templates and spreadsheet structure.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareVersions } from "../src/lib/updates/check";
import { relateVersions, relationCounts } from "../src/lib/sources/relations";
import { parseHeading, compareVersions as compareSections, comparisonSummary } from "../src/lib/sources/headings";
import { buildTemplate, normaliseClientTemplate } from "../src/lib/ingest/client-template";
import { parseWorkbook } from "../src/lib/ingest/parse";
import { findHeader } from "../src/lib/ai/sheets";

describe("update check: version comparison", () => {
  test("publisher labels are compared by their version, not the first number", () => {
    assert.equal(compareVersions("NIST SP 800-34 Rev. 1", "1"), 0);
    assert.equal(compareVersions("Revision 2", "1"), 1);
    assert.equal(compareVersions("CCMv4.1", "4.0"), 1);
    assert.equal(compareVersions("5.2.0", "5.1.1"), 1);
    assert.equal(compareVersions("2.0", "2.0"), 0);
  });
  test("a label without a version cannot be compared (never reported as up to date)", () => {
    assert.equal(compareVersions("Electronic Code of Federal Regulations", "1"), null);
  });
});

const sec = (doc: string, id: string, text: string) => ({ sourceSectionId: id, sectionName: `${doc} - Domain (D) - ${id}`, sectionText: `${doc} - Domain (D) - ${id}\n\n${text}` });
const v1 = (id: string, t: string) => sec("Doc v1", id, t);
const v2 = (id: string, t: string) => sec("Doc v2", id, t);

describe("version relations", () => {
  const prev = [
    v1("A-1", "Maintain an inventory of hardware assets including servers and laptops."),
    v1("A-2", "Review user access rights every quarter and revoke unneeded access."),
    v1("A-3", "Encrypt sensitive data at rest using approved algorithms. Encrypt sensitive data in transit using approved protocols."),
    v1("A-4", "Log security events centrally."),
    v1("A-5", "Retain security event logs for twelve months."),
    v1("A-6", "Operate a dedicated physical security badge office."),
  ];
  const cur = [
    v2("A-1", "Maintain an inventory of hardware assets including servers and laptops."),
    v2("A-2", "Review user access rights every month and revoke unneeded access promptly."),
    v2("B-7", "Encrypt sensitive data at rest using approved algorithms."),
    v2("B-8", "Encrypt sensitive data in transit using approved protocols."),
    v2("C-1", "Log security events centrally and retain security event logs for twelve months."),
    v2("D-1", "Govern cybersecurity risk with board oversight."),
  ];
  const rel = relateVersions(prev, cur);
  const kind = (from: string) => rel.find((r) => r.from.includes(from))?.kind;
  test("unchanged and modified sections keep their identifier", () => {
    assert.equal(kind("A-1"), "UNCHANGED");
    assert.equal(kind("A-2"), "MODIFIED");
  });
  test("a section divided into new identifiers is split, not removed plus added", () => {
    const r = rel.find((x) => x.kind === "SPLIT")!;
    assert.deepEqual([r.from, [...r.to].sort()], [["A-3"], ["B-7", "B-8"]]);
    assert.ok(r.confidence >= 0.7);
  });
  test("sections merged into one are combined", () => {
    const r = rel.find((x) => x.kind === "COMBINED")!;
    assert.deepEqual([[...r.from].sort(), r.to], [["A-4", "A-5"], ["C-1"]]);
  });
  test("unrelated sections are added and removed; every relation is explained", () => {
    assert.equal(kind("A-6"), "REMOVED");
    assert.ok(rel.some((r) => r.kind === "ADDED" && r.to[0] === "D-1"));
    assert.ok(rel.every((r) => r.explanation.length > 10 && r.confidence > 0));
    assert.deepEqual(relationCounts(rel), { UNCHANGED: 1, MODIFIED: 1, RENUMBERED: 0, SPLIT: 1, COMBINED: 1, ADDED: 1, REMOVED: 1 });
  });
  test("a renumbered requirement is not reported as new", () => {
    const r = relateVersions([v1("X-1", "Develop and maintain an incident response plan with roles and contacts.")], [v2("Y-9", "Develop and maintain an incident response plan with roles and contacts.")]);
    assert.equal(r[0].kind, "RENUMBERED");
  });
});

describe("library naming and comparison", () => {
  test("SP 800-53 style names are parsed (identifier and family)", () => {
    assert.deepEqual(parseHeading("NIST SP 800-53 r5.1.1: AC-02(01)-AUTOMATED SYSTEM ACCOUNT MANAGEMENT"), { domain: "AC", segment: null, identifier: "AC-02(01)" });
  });
  test("discussion text is ignored: only the requirement statement is compared", () => {
    const a = { sourceSectionId: "1", sectionName: "NIST SP 800-53 r5.1.1: SC-23-SESSION AUTHENTICITY", sectionText: "NIST SP 800-53 r5.1.1: SC-23-SESSION AUTHENTICITY\n\nProtect the authenticity of communications sessions.\n\n\nDiscussion:\nLong guidance text." };
    const b = { sourceSectionId: "2", sectionName: "Catalog - SC-23", sectionText: "Catalog - SC-23\n\nProtect the authenticity of communications sessions." };
    assert.equal(comparisonSummary(compareSections([a], [b])).unchanged, 1);
  });
});

describe("client control template", () => {
  test("the template imports controls, procedures and resolved Source IDs; unknown IDs are reported", () => {
    const buf = buildTemplate([
      ["EXAMPLE-01", "ignored", "", "", "", "", "202130"],
      ["CC-1", "Access reviews", "Quarterly review", "CC-1:TP1", "Inspect the review", "NIST CSF 1.1", "202130, 999999"],
      ["CC-1", "Access reviews", "Quarterly review", "CC-1:TP2", "Inspect revocations", "NIST CSF 1.1", "202158"],
    ]);
    const r = normaliseClientTemplate(parseWorkbook(buf), new Map([["202130", "cit-a"], ["202158", "cit-b"]]));
    assert.equal(r.dataset.controls.length, 1);
    assert.equal(r.dataset.testProcedures.length, 2);
    assert.equal(r.dataset.controlObligations.length, 2);
    assert.ok(r.issues.some((i) => i.code === "UNRESOLVED_SOURCE_ID" && i.message.includes("999999")));
    assert.ok(!r.issues.some((i) => i.severity === "ERROR"));
  });
});

describe("spreadsheet structure", () => {
  test("the header row is found below title rows", () => {
    const g = [["NIST Catalog", null, null], [null, null, null], ["Control ID", "Name", "Control Text"], ["AC-1", "Policy", "Develop a policy"], ["AC-2", "Accounts", "Manage accounts"], ["AC-3", "Enforcement", "Enforce access"]];
    assert.equal(findHeader(g), 2);
  });
});
