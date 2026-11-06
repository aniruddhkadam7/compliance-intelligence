import { test } from "node:test";
import assert from "node:assert/strict";
import { planLibrary } from "../src/lib/ingest/library-sync";

const SP53 = "NIST SP 800-53 r5.1.1 - Security and Privacy Controls for Information Systems and Organizations, 5.1.1";
const SP82 = "NIST SP 800-82r3 - Guide to Operational Technology (OT) Security";

// Library: SP 800-53 is document 204 but some of its sections are numbered 205xxx; SP 800-82 is document 206.
const frameworks = [{ id: "fw53", sourceId: "204", name: SP53 }, { id: "fw82", sourceId: "206", name: SP82 }];
const citations = [
  { id: "c53a", frameworkId: "fw53", sourceSectionId: "204001", sectionName: "AC-1 Policy" },
  { id: "c53b", frameworkId: "fw53", sourceSectionId: "205102", sectionName: "SI-4 Monitoring" },
  { id: "c82a", frameworkId: "fw82", sourceSectionId: "206102", sectionName: "6.2 OT Monitoring" },
];
const db = {
  framework: { findMany: async () => frameworks },
  citation: { findMany: async ({ where }: { where?: { frameworkId?: { in: string[] } } } = {}) => citations.filter((c) => !where?.frameworkId || where.frameworkId.in.includes(c.frameworkId)) },
} as never;

test("a document keeping its number is re-keyed when the file gives its section numbers to another document", async () => {
  // File: SP 800-53 stays 204 (sections renumbered 204xxx), SP 800-82 becomes 205 and takes 205102.
  const ds = {
    frameworks: [{ id: "f53", sourceId: "204", name: SP53 }, { id: "f82", sourceId: "205", name: SP82 }],
    citations: [
      { frameworkId: "f53", sourceSectionId: "204001", sectionName: "AC-1 Policy" },
      { frameworkId: "f53", sourceSectionId: "204555", sectionName: "SI-4 Monitoring" },
      { frameworkId: "f82", sourceSectionId: "205102", sectionName: "6.2 OT Monitoring" },
    ],
  } as never;
  const plan = await planLibrary(db, ds);
  assert.deepEqual(plan.renumbered.map((r) => [r.from, r.to]), [["206", "205"]]);
  assert.deepEqual(plan.resectioned.map((r) => [r.frameworkId, r.matched, r.sections]), [["fw53", 2, 2]]);
  assert.equal(plan.rekey.get("c53b"), "204555");
  assert.equal(plan.rekey.get("c82a"), "205102");
  // No two sections end up with the same number.
  const after = citations.map((c) => plan.rekey.get(c.id) ?? c.sourceSectionId);
  assert.equal(new Set(after).size, after.length);
  assert.equal(plan.lookup.get("205102"), "c82a");
});
