import type { CheckContext, CheckResult, ConnectorDefinition, DetectedChange, FetchedContent, FetchedSection } from "./types";
import { ConnectorError, diffMaps, fetchJson, fetchWithTimeout, sha256, stableHash } from "./http";

const sample = (ids: string[], n = 12) => ids.slice(0, n).join(", ") + (ids.length > n ? ` … (+${ids.length - n})` : "");
const versionNumber = (v: string | null | undefined) => v?.match(/\d+(?:\.\d+)*/)?.[0] ?? null;

// ---------------------------------------------------------------------------
// NIST CSF 2.0 via the Cybersecurity and Privacy Reference Tool (CPRT) JSON export
// ---------------------------------------------------------------------------

export interface CprtExport {
  response: {
    elements?: {
      documents: { doc_identifier: string; name: string; version: string; website?: string }[];
      elements: { element_type: string; element_identifier: string; title?: string; text?: string }[];
      relationships?: unknown[];
    };
  };
}

const CPRT = "https://csrc.nist.gov/extensions/nudp/services/json/nudp/framework/version";
const CSF_DOC = "csf_2_0_0";
/** Next identifiers CPRT would use for a new CSF release; checked to detect a new publication. */
const CSF_SUCCESSORS = ["csf_2_1_0", "csf_2_2_0", "csf_3_0_0"];

async function checkCprtCsf(ctx: CheckContext): Promise<CheckResult> {
  const { res, data } = await fetchJson<CprtExport>(`${CPRT}/${CSF_DOC}/export/json?element=all`);
  const el = data?.response.elements;
  if (!el?.documents?.length) throw new ConnectorError("CPRT export contained no document metadata", res.status);

  const doc = el.documents[0];
  const detectedVersion = versionNumber(doc.version) ?? doc.version;
  const core = el.elements.filter((e) => ["function", "category", "subcategory"].includes(e.element_type));
  const elements: Record<string, string> = Object.fromEntries(core.map((e) => [e.element_identifier, sha256(`${e.title ?? ""}|${e.text ?? ""}`)]));
  const contentHash = stableHash(elements);
  const counts = { functions: core.filter((e) => e.element_type === "function").length, categories: core.filter((e) => e.element_type === "category").length, subcategories: core.filter((e) => e.element_type === "subcategory").length };

  const changes: DetectedChange[] = [];
  const prev = ctx.state as { version?: string; elements?: Record<string, string> } | null;

  if (prev?.version && prev.version !== detectedVersion)
    changes.push({ changeType: "VERSION_CHANGE", title: `NIST CSF version changed: ${prev.version} → ${detectedVersion}`, summary: `CPRT now reports “${doc.version}” for ${doc.doc_identifier}.`, previousValue: prev.version, newValue: detectedVersion });
  // Compare against the workbook once per imported workbook version (a workbook may be imported after the baseline).
  const workbookCompared = (prev as { workbookCompared?: string | null } | null)?.workbookCompared ?? null;
  if (ctx.workbookVersion && workbookCompared !== ctx.workbookVersion && versionNumber(ctx.workbookVersion) !== detectedVersion)
    changes.push({ changeType: "VERSION_CHANGE", title: `Workbook cites CSF ${ctx.workbookVersion}; CPRT publishes ${detectedVersion}`, summary: `The imported workbook source “${ctx.workbookFrameworkName}” differs from the version in CPRT.`, previousValue: ctx.workbookVersion, newValue: detectedVersion });

  if (prev?.elements) {
    const d = diffMaps(prev.elements, elements);
    if (d.added.length || d.removed.length || d.modified.length)
      changes.push({
        changeType: "CONTENT_CHANGE",
        title: `CSF ${detectedVersion} content changed in CPRT (${d.added.length} added, ${d.modified.length} modified, ${d.removed.length} removed)`,
        summary: [d.added.length && `Added: ${sample(d.added)}`, d.modified.length && `Modified: ${sample(d.modified)}`, d.removed.length && `Removed: ${sample(d.removed)}`].filter(Boolean).join(" · "),
        details: d,
      });
  }

  // A new CSF release would appear in CPRT under a new identifier.
  const successors: string[] = [];
  for (const id of CSF_SUCCESSORS) {
    try {
      const r = await fetchJson<CprtExport>(`${CPRT}/${id}/export/json?element=documents`, { timeoutMs: 15_000 });
      if (r.data?.response.elements?.documents?.length) successors.push(`${id} (${r.data.response.elements.documents[0].version})`);
    } catch {
      /* identifier not published */
    }
  }
  const prevSucc = (prev as { successors?: string[] } | null)?.successors ?? [];
  const newSucc = successors.filter((s) => !prevSucc.includes(s));
  if (newSucc.length)
    changes.push({ changeType: "NEW_PUBLICATION", title: `New CSF release published in CPRT: ${newSucc.join(", ")}`, summary: "A successor framework version is available in the NIST CPRT catalogue.", newValue: newSucc.join(", ") });

  return {
    httpStatus: res.status,
    detectedVersion,
    contentHash,
    state: { version: detectedVersion, elements, successors, counts, workbookCompared: ctx.workbookVersion ?? workbookCompared },
    changes,
    message: prev ? (changes.length ? `${changes.length} new finding${changes.length === 1 ? "" : "s"} recorded` : `Same data as the previous check: CSF ${detectedVersion}, ${counts.subcategories} subcategories`) : `Baseline recorded: CSF ${detectedVersion}, ${counts.functions} functions / ${counts.categories} categories / ${counts.subcategories} subcategories`,
    details: { counts, document: doc, successorsChecked: CSF_SUCCESSORS },
  };
}

// ---------------------------------------------------------------------------
// NIST SP 800-53 Rev 5 OSCAL catalog (usnistgov/oscal-content on GitHub)
// ---------------------------------------------------------------------------

const OSCAL_URL = "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json";

interface OscalControl { id: string; title: string; props?: { name: string; value: string }[]; controls?: OscalControl[] }
interface OscalCatalog { catalog: { metadata: { title: string; version: string; "last-modified": string; "oscal-version": string }; groups: { id: string; controls: OscalControl[] }[] } }

async function checkOscal80053(ctx: CheckContext): Promise<CheckResult> {
  const prev = ctx.state as { version?: string; etag?: string; controls?: string[]; withdrawn?: string[]; lastModified?: string; workbookCompared?: string | null } | null;
  // Compare against the workbook once per imported workbook version (a workbook may be imported after the baseline).
  const workbookChange = (catalogVersion: string, title: string): DetectedChange | null =>
    ctx.workbookVersion && prev?.workbookCompared !== ctx.workbookVersion && ctx.workbookVersion !== catalogVersion
      ? {
          changeType: "VERSION_CHANGE",
          title: `Workbook cites SP 800-53 r${ctx.workbookVersion}; official OSCAL catalog is ${catalogVersion}`,
          summary: `The imported workbook source “${ctx.workbookFrameworkName}” predates the catalog published by NIST (${title}). Review whether cited controls changed.`,
          previousValue: ctx.workbookVersion, newValue: catalogVersion,
        }
      : null;
  const workbookCompared = ctx.workbookVersion ?? prev?.workbookCompared ?? null;

  const { res, data } = await fetchJson<OscalCatalog>(OSCAL_URL, { headers: prev?.etag ? { "If-None-Match": prev.etag } : {}, timeoutMs: 55_000 });
  if (res.status === 304 && prev) {
    const wc = prev.version ? workbookChange(prev.version, `SP 800-53 ${prev.version}`) : null;
    return {
      httpStatus: 304, detectedVersion: prev.version ?? null, contentHash: ctx.currentHash, state: { ...prev, workbookCompared },
      changes: wc ? [wc] : [], message: `Catalog file not modified since the previous check (HTTP 304): release ${prev.version ?? "unknown"}${wc ? "; 1 new finding recorded" : ""}`,
    };
  }
  if (!data) throw new ConnectorError("Empty OSCAL response", res.status);

  const m = data.catalog.metadata;
  const all: OscalControl[] = [];
  const walk = (cs: OscalControl[] = []) => cs.forEach((c) => { all.push(c); walk(c.controls); });
  data.catalog.groups.forEach((g) => walk(g.controls));
  const isWithdrawn = (c: OscalControl) => c.props?.some((p) => p.name === "status" && p.value === "withdrawn");
  const controls = all.filter((c) => !isWithdrawn(c)).map((c) => c.id).sort();
  const withdrawn = all.filter(isWithdrawn).map((c) => c.id).sort();
  const changes: DetectedChange[] = [];

  if (prev?.version && prev.version !== m.version)
    changes.push({ changeType: "VERSION_CHANGE", title: `SP 800-53 catalog version ${prev.version} → ${m.version}`, summary: `${m.title} (last modified ${m["last-modified"]}).`, previousValue: prev.version, newValue: m.version });
  const wc = workbookChange(m.version, m.title);
  if (wc) changes.push(wc);
  if (prev?.controls) {
    const add = controls.filter((c) => !prev.controls!.includes(c));
    const newlyWithdrawn = withdrawn.filter((c) => !(prev.withdrawn ?? []).includes(c));
    if (add.length || newlyWithdrawn.length)
      changes.push({ changeType: "CONTENT_CHANGE", title: `SP 800-53 controls changed: ${add.length} added, ${newlyWithdrawn.length} withdrawn`, summary: [add.length && `Added: ${sample(add)}`, newlyWithdrawn.length && `Withdrawn: ${sample(newlyWithdrawn)}`].filter(Boolean).join(" · "), details: { added: add, withdrawn: newlyWithdrawn } });
    else if (prev.lastModified && prev.lastModified !== m["last-modified"] && prev.version === m.version)
      changes.push({ changeType: "CONTENT_CHANGE", title: `SP 800-53 ${m.version} catalog republished (${m["last-modified"]})`, summary: "Same version and control set; catalog text or metadata was updated.", previousValue: prev.lastModified, newValue: m["last-modified"] });
  }

  return {
    httpStatus: res.status,
    detectedVersion: m.version,
    contentHash: stableHash({ controls, withdrawn, lastModified: m["last-modified"] }),
    state: { version: m.version, etag: res.headers.get("etag"), controls, withdrawn, lastModified: m["last-modified"], workbookCompared },
    changes,
    message: prev ? (changes.length ? `${changes.length} new finding${changes.length === 1 ? "" : "s"} recorded` : `Same catalog as the previous check: release ${m.version}`) : `Baseline recorded: ${m.version}, ${controls.length} active controls/enhancements, ${withdrawn.length} withdrawn`,
    details: { title: m.title, lastModified: m["last-modified"], oscalVersion: m["oscal-version"], activeControls: controls.length, withdrawn: withdrawn.length },
  };
}

// ---------------------------------------------------------------------------
// CSF 2.0 publication PDF: HTTP fingerprint only
// ---------------------------------------------------------------------------

const CSF_PDF = "https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf";

async function checkCsfPdf(ctx: CheckContext): Promise<CheckResult> {
  // nvlpubs.nist.gov answers HEAD with 404, so request a single byte instead.
  const res = await fetchWithTimeout(CSF_PDF, { headers: { Range: "bytes=0-0" }, timeoutMs: 20_000 });
  if (!res.ok) throw new ConnectorError(`HTTP ${res.status}`, res.status);
  await res.body?.cancel();
  const fp = {
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    length: res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length"),
  };
  const contentHash = sha256(JSON.stringify(fp));
  const prev = ctx.state as typeof fp | null;
  const changes: DetectedChange[] = [];
  if (prev && ctx.currentHash && ctx.currentHash !== contentHash)
    changes.push({
      changeType: "CONTENT_CHANGE",
      title: "NIST CSF publication (CSWP 29) file changed",
      summary: `HTTP fingerprint differs (Last-Modified ${prev.lastModified ?? "?"} → ${fp.lastModified ?? "?"}). Content may have been revised; check for an erratum or new release.`,
      previousValue: prev.lastModified, newValue: fp.lastModified, details: { previous: prev, current: fp },
    });
  return {
    httpStatus: res.status, detectedVersion: null, contentHash, state: fp, changes,
    message: prev ? (changes.length ? `File changed since the previous check (Last-Modified ${fp.lastModified})` : `File unchanged since the previous check (Last-Modified ${fp.lastModified})`) : `Baseline fingerprint recorded (Last-Modified ${fp.lastModified})`,
    details: fp,
  };
}

// ---------------------------------------------------------------------------
// Full content: the publisher's official data turned into library sections (no AI, text copied verbatim)
// ---------------------------------------------------------------------------

interface OscalParam { id: string; label?: string; select?: { "how-many"?: string; choice?: string[] } }
interface OscalPart { name: string; prose?: string; props?: { name: string; value: string }[]; parts?: OscalPart[] }
interface OscalFullControl { id: string; title: string; props?: { name: string; value: string }[]; params?: OscalParam[]; parts?: OscalPart[]; controls?: OscalFullControl[] }
export interface OscalFullCatalog {
  catalog: { metadata: { title: string; version: string; "last-modified": string; published?: string }; groups: { id: string; title: string; controls: OscalFullControl[] }[] };
}

/** "ac-2.4" -> "AC-02(04)", the identifier form the library uses for SP 800-53. */
export function oscalIdentifier(id: string) {
  const m = id.match(/^([a-z]{2})-(\d+)(?:\.(\d+))?$/i);
  if (!m) return id.toUpperCase();
  const pad = (n: string) => n.padStart(2, "0");
  return `${m[1].toUpperCase()}-${pad(m[2])}${m[3] ? `(${pad(m[3])})` : ""}`;
}

/**
 * Every active control and enhancement of an OSCAL catalog as a section: its statement (items indented, parameters
 * written as NIST prints them, e.g. "[Assignment: organization-defined frequency]") followed by its discussion.
 */
export function oscalSections(data: OscalFullCatalog): FetchedSection[] {
  const params = new Map<string, OscalParam>();
  const collect = (cs: OscalFullControl[] = []) => cs.forEach((c) => { (c.params ?? []).forEach((p) => params.set(p.id, p)); collect(c.controls); });
  data.catalog.groups.forEach((g) => collect(g.controls));

  const fill = (prose: string): string => prose.replace(/\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g, (_, id: string) => {
    const p = params.get(id);
    if (!p) return "[Assignment: organization-defined parameter]";
    if (p.select?.choice?.length) return `[Selection${p.select["how-many"] === "one-or-more" ? " (one or more)" : ""}: ${p.select.choice.map(fill).join("; ")}]`;
    return `[Assignment: ${p.label ?? "organization-defined parameter"}]`;
  });
  const statementText = (c: OscalFullControl) => {
    const statement = c.parts?.find((p) => p.name === "statement");
    if (!statement) return "";
    const lines: string[] = statement.prose ? [fill(statement.prose)] : [];
    const item = (part: OscalPart, depth: number) => {
      const label = part.props?.find((p) => p.name === "label")?.value;
      lines.push(`${"  ".repeat(depth)}${label ? `${label} ` : ""}${part.prose ? fill(part.prose) : ""}`.trimEnd());
      (part.parts ?? []).filter((x) => x.name === "item").forEach((x) => item(x, depth + 1));
    };
    (statement.parts ?? []).filter((x) => x.name === "item").forEach((x) => item(x, 0));
    return lines.join("\n");
  };

  const out: FetchedSection[] = [];
  for (const g of data.catalog.groups) {
    const walk = (controls: OscalFullControl[] = [], parent: OscalFullControl | null) => {
      for (const c of controls) {
        if (!c.props?.some((p) => p.name === "status" && p.value === "withdrawn")) {
          const discussion = c.parts?.find((p) => p.name === "guidance")?.prose;
          out.push({
            identifier: oscalIdentifier(c.id), title: c.title, path: [g.title], parentIdentifier: parent ? oscalIdentifier(parent.id) : null, contentType: "REQUIREMENT",
            text: [statementText(c), discussion ? `Discussion: ${fill(discussion)}` : ""].filter(Boolean).join("\n\n"),
          });
        }
        walk(c.controls, c);
      }
    };
    walk(g.controls, null);
  }
  return out;
}

/** "GOVERN (GV)" or "GOVERN" -> "Govern". */
const headingName = (title: string | undefined, fallback: string) => {
  const t = (title ?? "").replace(/\s*\([A-Z.]+\)\s*$/, "").trim() || fallback;
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

/** Every CSF subcategory in a CPRT export as a section, under its function and category, e.g. GV.OC-01. */
export function cprtSections(data: CprtExport): FetchedSection[] {
  const elements = data.response.elements?.elements ?? [];
  const byId = new Map(elements.map((e) => [e.element_identifier, e]));
  return elements.filter((e) => e.element_type === "subcategory").map((e) => {
    const categoryId = e.element_identifier.replace(/-\d+$/, "");
    const functionId = categoryId.split(".")[0];
    return {
      identifier: e.element_identifier, title: e.element_identifier, contentType: "REQUIREMENT", parentIdentifier: categoryId,
      path: [`${headingName(byId.get(functionId)?.title, functionId)} (${functionId})`, `${headingName(byId.get(categoryId)?.title, categoryId)} (${categoryId.split(".")[1] ?? categoryId})`],
      text: (e.text ?? e.title ?? "").trim(),
    };
  });
}

async function fetchOscal80053Content(): Promise<FetchedContent> {
  const { data } = await fetchJson<OscalFullCatalog>(OSCAL_URL, { timeoutMs: 120_000 });
  if (!data) throw new ConnectorError("Empty OSCAL response");
  const m = data.catalog.metadata;
  return {
    version: m.version, publisher: "NIST", documentType: "Good Practice", sourceUrl: OSCAL_URL,
    title: `NIST SP 800-53 r${m.version} - Security and Privacy Controls for Information Systems and Organizations, ${m.version}`,
    shortTitle: `NIST SP 800-53 r${m.version}`, publishedDate: (m.published ?? m["last-modified"])?.slice(0, 10) ?? null,
    sections: oscalSections(data),
  };
}

async function fetchCprtCsfContent(ctx: { state: Record<string, unknown> | null }): Promise<FetchedContent> {
  // The newest release CPRT publishes: a successor if the check has seen one, otherwise CSF 2.0.
  const seen = ((ctx.state as { successors?: string[] } | null)?.successors ?? []).map((s) => s.split(" ")[0]);
  const docId = seen.at(-1) ?? CSF_DOC;
  const url = `${CPRT}/${docId}/export/json?element=all`;
  const { data } = await fetchJson<CprtExport>(url, { timeoutMs: 60_000 });
  const doc = data?.response.elements?.documents?.[0];
  if (!data || !doc) throw new ConnectorError("CPRT export contained no document metadata");
  const version = versionNumber(doc.version) ?? doc.version;
  return {
    version, publisher: "NIST", documentType: "Good Practice", sourceUrl: url, publishedDate: null,
    title: `NIST Cybersecurity Framework (CSF) ${version}`, shortTitle: `NIST CSF ${version}`, sections: cprtSections(data),
  };
}

export const nistConnectors: ConnectorDefinition[] = [
  {
    id: "nist-csf2-cprt",
    name: "NIST CSF · CPRT",
    sourceName: "NIST Cybersecurity Framework (CPRT)",
    publisher: "NIST",
    mechanism: "JSON_EXPORT",
    officialUrl: "https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/CSF_2_0_0/home",
    endpointUrl: `${CPRT}/${CSF_DOC}/export/json?element=all`,
    pollingMinutes: 1440,
    framework: { family: "NIST CSF" },
    description: "Downloads the current CSF reference data from the NIST Cybersecurity and Privacy Reference Tool. Detects version changes, element-level content changes (functions, categories, subcategories) and successor CSF releases, and downloads a new release in full.",
    check: checkCprtCsf,
    fetchContent: fetchCprtCsfContent,
  },
  {
    id: "nist-sp80053-oscal",
    name: "NIST SP 800-53 Rev 5 · OSCAL",
    sourceName: "NIST SP 800-53 Rev 5 catalog",
    publisher: "NIST",
    mechanism: "JSON_FILE",
    officialUrl: "https://github.com/usnistgov/oscal-content/tree/main/nist.gov/SP800-53/rev5",
    endpointUrl: OSCAL_URL,
    pollingMinutes: 1440,
    framework: { family: "NIST SP 800-53" },
    description: "Reads the official OSCAL catalog published by NIST on GitHub (ETag-conditional). Detects catalog version changes and controls added or withdrawn, and compares against the workbook's cited release.",
    check: checkOscal80053,
    fetchContent: () => fetchOscal80053Content(),
  },
  {
    id: "nist-csf2-document",
    name: "NIST CSWP 29 · document watch",
    sourceName: "NIST CSF publication (PDF)",
    publisher: "NIST",
    mechanism: "HTTP_FINGERPRINT",
    officialUrl: "https://www.nist.gov/cyberframework",
    endpointUrl: CSF_PDF,
    pollingMinutes: 1440,
    framework: { family: "NIST CSF" },
    description: "No API exists for the publication itself. This watch compares the official PDF's ETag, Last-Modified and size. A change signals a revised file, not a specific content change.",
    check: checkCsfPdf,
  },
];
