// How a connector's state is described on the Connector page. Pure functions (no database), shared by the API route
// and the page, so the badge, the version labels and the last-check line are all derived from the same stored data:
// the library version in use, the version in the publisher's last response, and that response's status.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Short names used in version labels, e.g. "CSF 2.0" rather than "2.0". */
const SHORT: Record<string, string> = { "NIST CSF": "CSF", "NIST SP 800-53": "SP 800-53", GDPR: "GDPR", "EU AI Act": "AI Act" };

/** Consolidated EU text "02024R1689-20260727", or the original act "32024R1689". */
const CONSOLIDATED = /^0\d{4}[A-Z]\d{4}-(\d{4})(\d{2})(\d{2})$/;
const ORIGINAL_ACT = /^3(\d{4})[A-Z]\d{4}$/;

/** A raw version identifier as people read it: "CSF 2.0", "SP 800-53 5.2.0", "Consolidated text of 27 Jul 2026". */
export function readableVersion(family: string | null | undefined, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.match(CONSOLIDATED);
  if (c) return `Consolidated text of ${Number(c[3])} ${MONTHS[Number(c[2]) - 1]} ${c[1]}`;
  const o = raw.match(ORIGINAL_ACT);
  if (o) return `Original act (${o[1]})`;
  const short = family ? SHORT[family] ?? family : null;
  const v = raw.replace(/^v(?=\d)/i, "");
  return short ? `${short} ${v}` : v;
}

/**
 * The part of a version that is compared with the library's version label. EU texts are labelled by year in the library
 * ("2024", "2026"), so a consolidated text is compared by the year it was consolidated.
 */
export function comparableVersion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.match(CONSOLIDATED)?.[1] ?? raw.match(ORIGINAL_ACT)?.[1] ?? raw;
}

const numbers = (v: string | null | undefined) => ((v ?? "").match(/\d+(?:\.\d+)*/)?.[0] ?? "").split(".").map(Number);
/** Versions compared by their numbers, ignoring trailing zeros ("2.0" equals "2"). */
export function compareVersionLabels(a: string | null | undefined, b: string | null | undefined) {
  const x = numbers(a), y = numbers(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** True when the publisher's version is newer than the one in use. Unknown on either side is never "newer". */
export function publisherIsNewer(publisherRaw: string | null | undefined, libraryVersion: string | null | undefined) {
  const p = comparableVersion(publisherRaw);
  if (!p || !libraryVersion || !/\d/.test(p) || !/\d/.test(libraryVersion)) return false;
  return compareVersionLabels(p, libraryVersion) > 0;
}

export interface CheckSummaryInput { status: string; httpStatus: number | null; message?: string | null }

/**
 * What the publisher's last response said, in words. It describes that check only (whether anything differed from the
 * previous check), not whether the library is up to date.
 */
export function responseSummary(check: CheckSummaryInput | null | undefined, opts: { fingerprint?: boolean } = {}): string | null {
  if (!check) return null;
  const code = check.httpStatus != null ? `HTTP ${check.httpStatus}` : null;
  const what =
    check.status === "ERROR" ? "check failed"
      : check.status === "BASELINE" ? "first check, baseline recorded"
        : check.status === "CHANGED" ? (opts.fingerprint ? "file changed since the previous check" : "new findings recorded")
          : check.httpStatus === 304 ? "file not modified since the previous check"
            : opts.fingerprint ? "file unchanged since the previous check"
              : "same data as the previous check";
  return [code, what].filter(Boolean).join(" · ");
}

/** Scheduled checks run once a day at a fixed time, so a gap of up to two intervals is normal. */
export function isOverdue(lastCheckedAt: string | Date | null | undefined, pollingMinutes: number, now = Date.now()) {
  if (!lastCheckedAt) return true;
  return now - new Date(lastCheckedAt).getTime() > 2 * pollingMinutes * 60_000;
}

export type ConnectorStatusKind = "NOT_CHECKED" | "ERROR" | "UPDATE_AVAILABLE" | "REVIEW" | "UP_TO_DATE";

/**
 * One status per connector, in order of precedence: a failed last check, a newer version at the publisher than the one
 * in use, open findings, otherwise up to date.
 */
export function connectorStatus(c: { lastCheckedAt: string | Date | null; lastStatus: string | null; publisherNewer: boolean; openUpdates: number }): ConnectorStatusKind {
  if (!c.lastCheckedAt) return "NOT_CHECKED";
  if (c.lastStatus === "ERROR") return "ERROR";
  if (c.publisherNewer) return "UPDATE_AVAILABLE";
  if (c.openUpdates > 0) return "REVIEW";
  return "UP_TO_DATE";
}
