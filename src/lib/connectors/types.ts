export type ChangeType = "VERSION_CHANGE" | "CONTENT_CHANGE" | "NEW_PUBLICATION" | "NEW_INFORMATIVE_REFERENCE";
export type Mechanism = "JSON_EXPORT" | "JSON_FILE" | "SPARQL" | "HTTP_FINGERPRINT";

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  JSON_EXPORT: "Official JSON export (download endpoint, not a versioned API)",
  JSON_FILE: "Machine-readable file in an official repository",
  SPARQL: "Official SPARQL endpoint (EU Publications Office CELLAR)",
  HTTP_FINGERPRINT: "Document fingerprint (HTTP headers + hash). Not an API",
};

export interface DetectedChange {
  changeType: ChangeType;
  title: string;
  summary: string;
  previousValue?: string | null;
  newValue?: string | null;
  details?: Record<string, unknown>;
}

export interface CheckContext {
  /** Baseline stored from the previous successful check (null on first run). */
  state: Record<string, unknown> | null;
  currentVersion: string | null;
  currentHash: string | null;
  /** Version label of the linked framework in the imported workbook, if any. */
  workbookVersion: string | null;
  workbookFrameworkName: string | null;
}

export interface CheckResult {
  httpStatus: number;
  detectedVersion: string | null;
  contentHash: string | null;
  state: Record<string, unknown>;
  changes: DetectedChange[];
  message: string;
  details?: Record<string, unknown>;
}

/** One section of a framework version, copied verbatim from the publisher's official data. */
export interface FetchedSection {
  identifier: string;
  title: string;
  text: string;
  /** Headings above the section, e.g. ["Govern (GV)", "Organizational Context (OC)"]. */
  path: string[];
  parentIdentifier?: string | null;
  contentType?: string;
}

/** A complete framework version downloaded from the publisher. */
export interface FetchedContent {
  version: string;
  title: string;
  shortTitle: string;
  publisher: string;
  documentType: string;
  publishedDate: string | null;
  sourceUrl: string;
  sections: FetchedSection[];
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  sourceName: string;
  publisher: string;
  mechanism: Mechanism;
  officialUrl: string;
  endpointUrl: string;
  pollingMinutes: number;
  /** Document this connector monitors, matched by derived family and (optionally) version so it survives re-numbered IDs. */
  framework: { family: string; version?: string } | null;
  description: string;
  check: (ctx: CheckContext) => Promise<CheckResult>;
  /**
   * Downloads the full newest version the connector sees, where the publisher provides it as data. Connectors without
   * it only detect versions; their new versions are uploaded in the Admin Console.
   */
  fetchContent?: (ctx: { state: Record<string, unknown> | null }) => Promise<FetchedContent>;
}
