// Unit tests for which framework version a client control points to while an update is under review.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveVersions, type UpdateView } from "../src/lib/demo/versions";

const update = (over: Partial<UpdateView> = {}): UpdateView => ({
  status: "UPDATED", uploadedAfter: false, previousId: "csf11", currentId: "csf20",
  affected: new Set(["A-1", "A-2"]), approved: new Set(), rejected: new Set(), ...over,
});

describe("control versions during an update", () => {
  test("before the update is applied every control stays on the previous version", () => {
    const r = resolveVersions([update({ status: "AVAILABLE" })], "A-1");
    assert.deepEqual([...r.hidden], ["csf20"]);
    assert.equal(r.highlight.size, 0);
  });

  test("an affected control stays on the previous version until approved, flagged pending", () => {
    const r = resolveVersions([update()], "A-1");
    assert.deepEqual([...r.hidden], ["csf20"]);
    assert.equal(r.highlight.get("csf11"), "pending");
  });

  test("approving moves the control to the new version, flagged updated", () => {
    const r = resolveVersions([update({ approved: new Set(["A-1"]) })], "A-1");
    assert.deepEqual([...r.hidden], ["csf11"]);
    assert.equal(r.highlight.get("csf20"), "updated");
  });

  test("rejecting keeps the control on the previous version, flagged rejected", () => {
    const r = resolveVersions([update({ rejected: new Set(["A-1"]) })], "A-1");
    assert.deepEqual([...r.hidden], ["csf20"]);
    assert.equal(r.highlight.get("csf11"), "rejected");
  });

  test("reconsidering (in neither list) puts it back to pending", () => {
    assert.equal(resolveVersions([update()], "A-2").highlight.get("csf11"), "pending");
  });

  test("a control the update does not affect moves to the new version with no review flag", () => {
    const r = resolveVersions([update()], "Z-9");
    assert.deepEqual([...r.hidden], ["csf11"]);
    assert.equal(r.highlight.size, 0);
  });

  test("controls uploaded after the update map to the new version with nothing to approve", () => {
    const r = resolveVersions([update({ uploadedAfter: true })], "A-1");
    assert.deepEqual([...r.hidden], ["csf11"]);
    assert.equal(r.highlight.size, 0);
  });

  test("an update with no impact data leaves controls where they are", () => {
    const r = resolveVersions([update({ affected: new Set() })], "A-1");
    assert.equal(r.hidden.size, 0);
  });

  test("several updates are resolved independently", () => {
    const cis = update({ previousId: "cis8", currentId: "cis81", approved: new Set(["A-1"]) });
    const r = resolveVersions([update(), cis], "A-1");
    assert.deepEqual([...r.hidden].sort(), ["cis8", "csf20"]);
    assert.equal(r.highlight.get("csf11"), "pending");
    assert.equal(r.highlight.get("cis81"), "updated");
  });
});
