// Labels for "Check for Updates" results. Shared by server and client components (no server imports).
import type { Tone } from "@/components/ui/badge";

export const UPDATE_CHECK: Record<string, { label: string; tone: Tone; hint: string }> = {
  UP_TO_DATE: { label: "Up to date", tone: "success", hint: "No newer version was verified at the publisher's official source." },
  UPDATE_AVAILABLE: { label: "Update available", tone: "warning", hint: "A newer version was verified at the publisher's official source." },
  UNABLE_TO_VERIFY: { label: "Unable to verify", tone: "neutral", hint: "The publisher's source could not be checked reliably. This is not the same as up to date." },
  CHECK_FAILED: { label: "Check failed", tone: "danger", hint: "A technical error occurred. The last successful result, if any, is in the history." },
  NOT_CHECKED: { label: "Not checked yet", tone: "outline", hint: "Use Check for Updates." },
};

export const CHECK_METHOD: Record<string, string> = {
  PUBLISHER_DATA: "Publisher's structured data (API or machine-readable catalogue)",
  ISO_OPEN_DATA: "ISO open data: ISO's official catalogue of editions, amendments and withdrawals",
  OFFICIAL_SEARCH: "AI search limited to the publisher's official domains; the version was confirmed on the fetched official page",
  OFFICIAL_PAGE: "Official publisher page, read with AI; only quotes found on the page are accepted",
  NONE: "No official source recorded",
};
