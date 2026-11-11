import { test } from "node:test";
import assert from "node:assert/strict";
import { connectorStatus, isOverdue, publisherIsNewer, readableVersion, responseSummary } from "../src/lib/connectors/status";

test("readable version labels replace raw identifiers", () => {
  assert.equal(readableVersion("NIST CSF", "2.0"), "CSF 2.0");
  assert.equal(readableVersion("NIST SP 800-53", "5.2.0"), "SP 800-53 5.2.0");
  assert.equal(readableVersion("EU AI Act", "02024R1689-20260727"), "Consolidated text of 27 Jul 2026");
  assert.equal(readableVersion("GDPR", "02016R0679-20160504"), "Consolidated text of 4 May 2016");
  assert.equal(readableVersion("GDPR", "32016R0679"), "Original act (2016)");
  assert.equal(readableVersion("GDPR", "2016"), "GDPR 2016");
  assert.equal(readableVersion("NIST CSF", null), null);
});

test("publisher version is compared with the version in use", () => {
  assert.equal(publisherIsNewer("2.0", "1.1"), true); // NIST CSF demo baseline
  assert.equal(publisherIsNewer("2.0", "2.0"), false);
  assert.equal(publisherIsNewer("5.2.0", "5.1.1"), true);
  assert.equal(publisherIsNewer("02024R1689-20260727", "2024"), true); // consolidated 2026 vs original 2024
  assert.equal(publisherIsNewer("02024R1689-20260727", "2026"), false);
  assert.equal(publisherIsNewer("02016R0679-20160504", "2016"), false);
  assert.equal(publisherIsNewer(null, "1.1"), false); // document watch reports no version
  assert.equal(publisherIsNewer("2.0", null), false);
});

test("one status per connector, never contradictory", () => {
  const base = { lastCheckedAt: "2026-11-10T00:00:00Z", lastStatus: "OK", publisherNewer: false, openUpdates: 0 };
  assert.equal(connectorStatus({ ...base, lastCheckedAt: null }), "NOT_CHECKED");
  assert.equal(connectorStatus({ ...base, lastStatus: "ERROR", publisherNewer: true }), "ERROR");
  assert.equal(connectorStatus({ ...base, publisherNewer: true, openUpdates: 1 }), "UPDATE_AVAILABLE");
  assert.equal(connectorStatus({ ...base, openUpdates: 2 }), "REVIEW");
  assert.equal(connectorStatus(base), "UP_TO_DATE");
});

test("response summary describes the check, not the library", () => {
  assert.equal(responseSummary({ status: "OK", httpStatus: 304 }), "HTTP 304 · file not modified since the previous check");
  assert.equal(responseSummary({ status: "OK", httpStatus: 200 }), "HTTP 200 · same data as the previous check");
  assert.equal(responseSummary({ status: "OK", httpStatus: 206 }, { fingerprint: true }), "HTTP 206 · file unchanged since the previous check");
  assert.equal(responseSummary({ status: "CHANGED", httpStatus: 200 }), "HTTP 200 · new findings recorded");
  assert.equal(responseSummary({ status: "ERROR", httpStatus: null }), "check failed");
  assert.equal(responseSummary(null), null);
});

test("a daily connector is overdue after two missed intervals", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(isOverdue("2026-11-09T07:00:00Z", 1440, now), false);
  assert.equal(isOverdue("2026-11-05T18:53:00Z", 1440, now), true);
  assert.equal(isOverdue(null, 1440, now), true);
});
