// Unit tests for turning a publisher's official data into library sections (connectors that download full versions).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cprtSections, oscalIdentifier, oscalSections, type CprtExport, type OscalFullCatalog } from "../src/lib/connectors/nist";
import { compareVersionLabels } from "../src/lib/connectors/content";

describe("NIST SP 800-53 OSCAL catalog", () => {
  const catalog: OscalFullCatalog = {
    catalog: {
      metadata: { title: "SP 800-53 Rev 5.2.0", version: "5.2.0", "last-modified": "2025-08-27T00:00:00Z" },
      groups: [{
        id: "cp", title: "Contingency Planning",
        controls: [{
          id: "cp-7", title: "Alternate Processing Site",
          params: [{ id: "cp-07_odp.01", label: "organization-defined time period" }, { id: "cp-07_odp.02", select: { "how-many": "one-or-more", choice: ["electronic", "physical"] } }],
          parts: [
            { name: "statement", parts: [
              { name: "item", props: [{ name: "label", value: "a." }], prose: "Establish an alternate site within {{ insert: param, cp-07_odp.01 }};" },
              { name: "item", props: [{ name: "label", value: "b." }], prose: "Use {{ insert: param, cp-07_odp.02 }} means.", parts: [{ name: "item", props: [{ name: "label", value: "1." }], prose: "Nested item." }] },
            ] },
            { name: "guidance", prose: "Alternate sites are geographically distinct." },
          ],
          controls: [
            { id: "cp-7.4", title: "Preparation for Use", parts: [{ name: "statement", prose: "Prepare the alternate site." }] },
            { id: "cp-7.5", title: "Equivalent Information Security Safeguards", props: [{ name: "status", value: "withdrawn" }] },
          ],
        }],
      }],
    },
  };

  test("identifiers follow the library's form", () => {
    assert.equal(oscalIdentifier("cp-7"), "CP-07");
    assert.equal(oscalIdentifier("cp-7.4"), "CP-07(04)");
    assert.equal(oscalIdentifier("ac-12"), "AC-12");
  });

  test("active controls and enhancements become sections; withdrawn ones are left out", () => {
    const s = oscalSections(catalog);
    assert.deepEqual(s.map((x) => x.identifier), ["CP-07", "CP-07(04)"]);
    assert.equal(s[1].parentIdentifier, "CP-07");
    assert.deepEqual(s[0].path, ["Contingency Planning"]);
  });

  test("statements keep item labels, nesting and parameters as NIST prints them, then the discussion", () => {
    const text = oscalSections(catalog)[0].text;
    assert.match(text, /^a\. Establish an alternate site within \[Assignment: organization-defined time period\];/);
    assert.match(text, /b\. Use \[Selection \(one or more\): electronic; physical\] means\./);
    assert.match(text, /\n {2}1\. Nested item\./);
    assert.match(text, /\n\nDiscussion: Alternate sites are geographically distinct\.$/);
  });
});

describe("NIST CSF CPRT export", () => {
  const data: CprtExport = {
    response: {
      elements: {
        documents: [{ doc_identifier: "csf_2_0_0", name: "CSF", version: "2.0" }],
        elements: [
          { element_type: "function", element_identifier: "GV", title: "GOVERN" },
          { element_type: "category", element_identifier: "GV.OC", title: "Organizational Context" },
          { element_type: "subcategory", element_identifier: "GV.OC-01", text: "The organizational mission is understood." },
        ],
      },
    },
  };
  test("subcategories become sections under their function and category", () => {
    const [s] = cprtSections(data);
    assert.equal(s.identifier, "GV.OC-01");
    assert.deepEqual(s.path, ["Govern (GV)", "Organizational Context (OC)"]);
    assert.equal(s.text, "The organizational mission is understood.");
    assert.equal(s.parentIdentifier, "GV.OC");
  });
});

describe("version labels", () => {
  test("compared by number, ignoring trailing zeros", () => {
    assert.ok(compareVersionLabels("5.2.0", "5.1.1") > 0);
    assert.equal(compareVersionLabels("2.0", "2"), 0);
    assert.ok(compareVersionLabels("5", "5.1.1") < 0);
  });
});
