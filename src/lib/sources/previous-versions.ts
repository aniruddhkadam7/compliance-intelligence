// Previous-version records: the version each document replaced, the publisher facts and the official source,
// plus the version of the three laws the client workbook leaves blank. Researched from ISO open data and the
// publishers' official pages. Matched by document (family and version, see documentKey), not by Source ID,
// because workbooks can renumber Source IDs. Only empty fields are filled and nothing is deleted.
import { prisma } from "@/lib/db";
import { documentKey } from "@/lib/frameworks";

const ISO = "https://www.iso.org/open-data.html";
/** doc: the document's key; sourceId: its Source ID in the library the record was researched for (reference only). */
type Row = { doc: string; sourceId: string; prev: string | null; note: string; src: string | null; version?: string };
export const PREVIOUS_VERSIONS: Row[] = [
  { doc: "21 CFR Part 11|", sourceId: "100", version: "1997", prev: null, note: "Original rule published 20 March 1997 (62 FR 13430), effective 20 August 1997. No earlier version; later changes are technical amendments to the same Part.", src: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11" },
  { doc: "China PIPL|", sourceId: "110", version: "2021", prev: null, note: "First national personal information protection law of the PRC: adopted 20 August 2021, in force 1 November 2021. No earlier version.", src: null },
  { doc: "CIS Controls|8.1", sourceId: "121", prev: "8", note: "CIS Controls v8 (May 2021) was succeeded by v8.1 (June 2024).", src: "https://www.cisecurity.org/controls/v8-1" },
  { doc: "CSA CCM|4.0", sourceId: "130", prev: "3.0.1", note: "CSA released CCM v4.0 in January 2021 as the successor to CCM v3.0.1, adding new control domains (e.g. Logging and Monitoring) and more than 60 new controls.", src: "https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4" },
  { doc: "Cloud Controls Matrix|", sourceId: "131", prev: "4.0.13", note: "CSA states CCM v4.1 (released January 2026) succeeds CCM v4.0.13. The library copy is labelled 4.1.1.", src: "https://cloudsecurityalliance.org/articles/ccm-v4-1-transition-timeline" },
  { doc: "COBIT|4.1", sourceId: "140", prev: "4.0", note: "COBIT 4.0 (2005) was succeeded by COBIT 4.1 (2007). COBIT 4.1 has since been superseded by COBIT 5 and COBIT 2019.", src: "https://www.isaca.org/resources/cobit" },
  { doc: "EU AI Act|", sourceId: "150", version: "2024", prev: null, note: "Regulation (EU) 2024/1689 is the original act; no earlier version. It was later amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI, in force 27 July 2026), which is an update, not a predecessor.", src: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj" },
  { doc: "GDPR|2016", sourceId: "280", prev: "Directive 95/46/EC", note: "The GDPR repealed Directive 95/46/EC (Data Protection Directive) with effect from 25 May 2018 (Article 94).", src: "https://eur-lex.europa.eu/eli/reg/2016/679/oj" },
  { doc: "IEC 62443-2-1|2010", sourceId: "160", prev: null, note: "IEC 62443-2-1:2010 is Edition 1.0, the first IEC edition. No earlier IEC version.", src: "https://webstore.iec.ch/publication/7030" },
  { doc: "IEC 62443-2-3|2015", sourceId: "161", prev: null, note: "IEC TR 62443-2-3:2015 is Edition 1.0 (2015-06), the first edition. No earlier version.", src: "https://webstore.iec.ch/publication/22811" },
  { doc: "IEC 62443-3-1|2009", sourceId: "162", prev: null, note: "IEC TR 62443-3-1:2009 is Edition 1.0, the first edition. No earlier version.", src: "https://webstore.iec.ch/publication/7031" },
  { doc: "IEC 62443-3-2|2020", sourceId: "163", prev: null, note: "IEC 62443-3-2:2020 is Edition 1.0, the first edition. No earlier version.", src: "https://webstore.iec.ch/publication/30727" },
  { doc: "IEC 62443-4-2|2019", sourceId: "164", prev: null, note: "IEC 62443-4-2:2019 is Edition 1.0, the first edition. No earlier version.", src: "https://webstore.iec.ch/publication/34421" },
  { doc: "ISO 22301|2019", sourceId: "180", prev: "2012", note: "ISO open data: ISO 22301:2012 (edition 1, published 2012-05-15, withdrawn) was replaced by ISO 22301:2019 (edition 2, published 2019-10-30).", src: ISO },
  { doc: "ISO 27005|2022", sourceId: "170", prev: "2018", note: "ISO open data: ISO/IEC 27005:2018 (edition 3, published 2018-07-09, withdrawn) was replaced by ISO/IEC 27005:2022 (edition 4, published 2022-10-25).", src: ISO },
  { doc: "ISO 9001|2015", sourceId: "261", prev: "2008", note: "ISO open data: ISO 9001:2008 (edition 4, published 2008-11-13, withdrawn) was replaced by ISO 9001:2015 (edition 5, published 2015-09-22).", src: ISO },
  { doc: "ISO/IEC 27002|2022", sourceId: "262", prev: "2013", note: "ISO open data: ISO/IEC 27002:2013 (edition 2, published 2013-09-25, withdrawn) was replaced by ISO/IEC 27002:2022 (edition 3, published 2022-02-15).", src: ISO },
  { doc: "ISO/IEC 27017|2015", sourceId: "263", prev: null, note: "ISO open data: ISO/IEC 27017:2015 is edition 1 (published 2015-11-30); no earlier edition.", src: ISO },
  { doc: "ISO/IEC 27018|2019", sourceId: "264", prev: "2014", note: "ISO open data: ISO/IEC 27018:2014 (edition 1, published 2014-07-29, withdrawn) was replaced by ISO/IEC 27018:2019 (edition 2, published 2019-01-15).", src: ISO },
  { doc: "ISO/IEC 42001|2023", sourceId: "190", prev: null, note: "ISO open data: ISO/IEC 42001:2023 is edition 1 (published 2023-12-18); no earlier edition.", src: ISO },
  { doc: "NIST AI RMF|1.0", sourceId: "200", prev: null, note: "AI RMF 1.0 (January 2023) is the first release. No earlier version.", src: "https://www.nist.gov/itl/ai-risk-management-framework" },
  { doc: "NIST CSF|1.1", sourceId: "202", prev: "1.0", note: "NIST CSF 1.0 (February 2014) was succeeded by CSF 1.1 (April 2018).", src: "https://www.nist.gov/cyberframework" },
  { doc: "NIST CSF|2.0", sourceId: "201", prev: "1.1", note: "NIST CSF 1.1 (April 2018) was succeeded by CSF 2.0 (February 2024).", src: "https://www.nist.gov/cyberframework" },
  { doc: "NIST SP 800-34|1", sourceId: "203", prev: "Original (2002)", note: "The original SP 800-34 (June 2002) was superseded by SP 800-34 Rev. 1 (May 2010, updated November 2010).", src: "https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final" },
  { doc: "NIST SP 800-53|5.1.1", sourceId: "204", prev: "5.1", note: "SP 800-53 Rev. 5 was published September 2020 with updates of 10 December 2020 (release 5.1). NIST issued patch release 5.1.1 on 7 November 2023. The previous revision was Rev. 4.", src: "https://www.nist.gov/news-events/news/2023/11/nist-issues-sp-800-53-release-511-cybersecurity-and-privacy-reference-tool" },
  { doc: "NIST SP 800-82|3", sourceId: "205", prev: "Rev. 2", note: "SP 800-82 Rev. 2 (May 2015) was superseded by SP 800-82 Rev. 3 (September 2023).", src: "https://csrc.nist.gov/pubs/sp/800/82/r3/final" },
  { doc: "SOX|2002", sourceId: "290", prev: null, note: "Sarbanes-Oxley Act of 2002 (Pub. L. 107-204, enacted 30 July 2002) is the original act. No earlier version.", src: "https://www.congress.gov/bill/107th-congress/house-bill/3763" },
];

/** Fills empty previous-version fields (and blank law versions). With apply=false nothing is written. */
export async function fillPreviousVersions(apply: boolean) {
  const changes: { sourceId: string; name: string; fields: string[] }[] = [];
  const fws = await prisma.framework.findMany({ select: { id: true, sourceId: true, name: true, versionLabel: true, previousVersionNote: true } });
  for (const fw of fws) {
    const r = BY_DOC.get(documentKey(fw.name));
    if (!r) continue;
    const data: { previousVersion?: string | null; previousVersionNote?: string; previousVersionSource?: string | null; versionLabel?: string } = {};
    if (!fw.previousVersionNote) Object.assign(data, { previousVersion: r.prev, previousVersionNote: r.note, previousVersionSource: r.src });
    if (r.version && !fw.versionLabel) data.versionLabel = r.version;
    if (!Object.keys(data).length) continue;
    if (apply) await prisma.framework.update({ where: { id: fw.id }, data });
    changes.push({ sourceId: fw.sourceId, name: fw.name, fields: Object.keys(data) });
  }
  return { applied: apply, changes };
}

const BY_DOC = new Map(PREVIOUS_VERSIONS.map((r) => [r.doc, r]));

/**
 * Previous-version record of a document: the stored one, else the built-in researched record (so the column
 * is never empty just because a database has not been filled). Pure: safe in any query.
 */
export function previousVersionOf(f: { name: string; previousVersion: string | null; previousVersionNote: string | null; previousVersionSource: string | null; documentUrl: string | null }) {
  if (f.previousVersionNote) return { version: f.previousVersion, note: f.previousVersionNote, source: f.previousVersionSource ?? f.documentUrl };
  const r = BY_DOC.get(documentKey(f.name));
  return r ? { version: r.prev, note: r.note, source: r.src ?? f.documentUrl } : null;
}

/** Version label, falling back to the researched version for laws the workbook leaves blank (e.g. "1997"). */
export const versionOf = (f: { name: string; versionLabel: string | null }) => f.versionLabel ?? BY_DOC.get(documentKey(f.name))?.version ?? null;
