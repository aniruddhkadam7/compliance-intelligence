// Unit tests for turning the AI review's successor choices into version relations.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupSuccessors, natureCounts, type ReviewedRelation } from "../src/lib/ai/review-changes";

const decided = (entries: [string, string[]][]) => new Map(entries.map(([from, successors]) => [from, { successors, reason: `why ${from}` }]));

describe("AI review: successor grouping", () => {
  test("one old section with one successor is renumbered", () => {
    assert.deepEqual(groupSuccessors(decided([["PR.AC-1", ["PR.AA-01"]]])).map((g) => [g.kind, g.from, g.to]), [["RENUMBERED", ["PR.AC-1"], ["PR.AA-01"]]]);
  });

  test("one old section with several successors is split", () => {
    assert.deepEqual(groupSuccessors(decided([["ID.GV-1", ["GV.PO-01", "GV.PO-02"]]])).map((g) => [g.kind, g.to]), [["SPLIT", ["GV.PO-01", "GV.PO-02"]]]);
  });

  test("several old sections sharing one successor are combined, with both reasons", () => {
    const [g] = groupSuccessors(decided([["PR.AC-1", ["PR.AA-01"]], ["PR.AC-6", ["PR.AA-01"]]]));
    assert.equal(g.kind, "COMBINED");
    assert.deepEqual(g.from, ["PR.AC-1", "PR.AC-6"]);
    assert.match(g.reason, /why PR.AC-1.*why PR.AC-6/);
  });

  test("never links sections the model did not pair (no cross product)", () => {
    const groups = groupSuccessors(decided([["A-1", ["B-1", "B-2"]], ["A-2", ["B-2"]]]));
    const links = groups.flatMap((g) => g.from.flatMap((f) => g.to.map((t) => `${f}>${t}`))).sort();
    assert.deepEqual(links, ["A-1>B-1", "A-1>B-2", "A-2>B-2"]);
  });

  test("an old section with no successor produces no relation", () => {
    assert.deepEqual(groupSuccessors(decided([["DE.DP-5", []]])), []);
  });
});

describe("AI review: nature counts", () => {
  test("counts modified sections by the nature the review gave", () => {
    const rel = (nature?: "EDITORIAL" | "SUBSTANTIVE"): ReviewedRelation => ({ kind: "MODIFIED", from: ["X"], to: ["X"], confidence: 0.5, explanation: "", ...(nature && { review: { by: "AI", model: "m", nature, reason: "r" } }) });
    assert.deepEqual(natureCounts([rel("EDITORIAL"), rel("SUBSTANTIVE"), rel("SUBSTANTIVE"), rel()]), { editorial: 1, substantive: 2, reassigned: 0, unreviewed: 1 });
  });
});
