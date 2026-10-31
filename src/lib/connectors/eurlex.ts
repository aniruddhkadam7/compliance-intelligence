// EU legislation via the Publications Office CELLAR SPARQL endpoint.
// Follows CDM relationships from the base act: consolidated versions, corrigenda, amending acts.
import type { CheckContext, CheckResult, ConnectorDefinition, DetectedChange } from "./types";
import { ConnectorError, fetchJson, stableHash } from "./http";

const SPARQL = "https://publications.europa.eu/webapi/rdf/sparql";

type Kind = "consolidated" | "corrigendum" | "amendment";
interface Item { celex: string; date: string | null; kind: Kind }

function query(celex: string) {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT ?celex ?date ?rel WHERE {
  ?act cdm:resource_legal_id_celex "${celex}"^^<http://www.w3.org/2001/XMLSchema#string> .
  { ?w cdm:resource_legal_corrects_resource_legal ?act . BIND("corrigendum" AS ?rel) }
  UNION { ?w cdm:act_consolidated_consolidates_resource_legal ?act . BIND("consolidated" AS ?rel) }
  UNION { ?w cdm:resource_legal_amends_resource_legal ?act . BIND("amendment" AS ?rel) }
  ?w cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?w cdm:work_date_document ?date }
} ORDER BY ?date`;
}

interface SparqlResult { results: { bindings: { celex: { value: string }; date?: { value: string }; rel: { value: Kind } }[] } }

const eurlexUrl = (celex: string) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celex)}`;

const CHANGE_FOR: Record<Kind, { type: DetectedChange["changeType"]; noun: string }> = {
  consolidated: { type: "VERSION_CHANGE", noun: "consolidated version" },
  corrigendum: { type: "CONTENT_CHANGE", noun: "corrigendum" },
  amendment: { type: "NEW_PUBLICATION", noun: "amending act" },
};

function makeCheck(baseCelex: string, label: string) {
  // Consolidated texts of this act share its number: 3YYYYRNNNN → 0YYYYRNNNN-<date>.
  const consolidatedPrefix = "0" + baseCelex.slice(1);
  return async (ctx: CheckContext): Promise<CheckResult> => {
    const url = `${SPARQL}?query=${encodeURIComponent(query(baseCelex))}`;
    const { res, data } = await fetchJson<SparqlResult>(url, { headers: { Accept: "application/sparql-results+json" }, timeoutMs: 50_000 });
    if (!data) throw new ConnectorError("Empty SPARQL response", res.status);
    const items: Item[] = data.results.bindings
      .map((b) => ({ celex: b.celex.value, date: b.date?.value ?? null, kind: b.rel.value }))
      // The consolidation predicate also returns other acts' consolidations that this act amended.
      .filter((i) => i.kind !== "consolidated" || i.celex.startsWith(consolidatedPrefix));
    const unique = [...new Map(items.map((i) => [i.celex, i])).values()];
    const latestConsolidated = unique.filter((i) => i.kind === "consolidated").sort((a, b) => (a.celex < b.celex ? 1 : -1))[0];
    const detectedVersion = latestConsolidated?.celex ?? baseCelex;
    const known = new Set(((ctx.state as { items?: Item[] } | null)?.items ?? []).map((i) => i.celex));
    const changes: DetectedChange[] = [];

    if (!ctx.state) {
      // Baseline: the workbook cites the original act; report later publications once, aggregated.
      const later = unique;
      if (later.length)
        changes.push({
          changeType: "NEW_PUBLICATION",
          title: `${label}: ${later.length} publications since the original act`,
          summary: `The workbook cites the original act (CELEX ${baseCelex}). CELLAR lists ${count(later, "amendment")} amending act(s), ${count(later, "corrigendum")} corrigenda and ${count(later, "consolidated")} consolidated version(s). Latest consolidated text: ${latestConsolidated?.celex ?? "none"}.`,
          previousValue: baseCelex,
          newValue: detectedVersion,
          details: { items: later.map((i) => ({ ...i, url: eurlexUrl(i.celex) })) },
        });
    } else {
      for (const i of unique.filter((x) => !known.has(x.celex))) {
        const c = CHANGE_FOR[i.kind];
        changes.push({
          changeType: c.type,
          title: `${label}: new ${c.noun} ${i.celex}`,
          summary: `Published ${i.date ?? "(date not stated)"}. ${i.kind === "consolidated" ? "A new consolidated text incorporates amendments or corrections." : i.kind === "corrigendum" ? "A correction to the published text." : "An act that amends this regulation."}`,
          previousValue: (ctx.currentVersion as string) ?? null,
          newValue: i.celex,
          details: { ...i, url: eurlexUrl(i.celex) },
        });
      }
    }

    return {
      httpStatus: res.status,
      detectedVersion,
      contentHash: stableHash(unique.map((i) => i.celex).sort()),
      state: { items: unique },
      changes,
      message: ctx.state ? (changes.length ? `${changes.length} new publication(s)` : `No change. ${unique.length} related publications known`) : `Baseline recorded: ${unique.length} related publications; latest consolidated ${detectedVersion}`,
      details: { latestConsolidated: latestConsolidated ?? null, counts: { amendments: count(unique, "amendment"), corrigenda: count(unique, "corrigendum"), consolidated: count(unique, "consolidated") } },
    };
  };
}

const count = (items: Item[], k: Kind) => items.filter((i) => i.kind === k).length;

export const eurlexConnectors: ConnectorDefinition[] = [
  {
    id: "eurlex-gdpr",
    name: "GDPR · EUR-Lex CELLAR",
    sourceName: "Regulation (EU) 2016/679 (GDPR)",
    publisher: "Publications Office of the EU",
    mechanism: "SPARQL",
    officialUrl: eurlexUrl("32016R0679"),
    endpointUrl: SPARQL,
    pollingMinutes: 1440,
    frameworkSourceId: "310",
    description: "Queries CELLAR for consolidated versions, corrigenda and amending acts linked to CELEX 32016R0679.",
    check: makeCheck("32016R0679", "GDPR"),
  },
  {
    id: "eurlex-ai-act",
    name: "EU AI Act · EUR-Lex CELLAR",
    sourceName: "Regulation (EU) 2024/1689 (AI Act)",
    publisher: "Publications Office of the EU",
    mechanism: "SPARQL",
    officialUrl: eurlexUrl("32024R1689"),
    endpointUrl: SPARQL,
    pollingMinutes: 1440,
    frameworkSourceId: "997",
    description: "Queries CELLAR for consolidated versions, corrigenda and amending acts linked to CELEX 32024R1689.",
    check: makeCheck("32024R1689", "EU AI Act"),
  },
];
