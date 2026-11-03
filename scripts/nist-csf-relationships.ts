// Usage: npx tsx scripts/nist-csf-relationships.ts <out.xlsx> [nist-export.xlsx]
//
// Builds a cross-framework relationship file (Source ID A | Source ID B | Relationship | Notes) from NIST's
// official CSF 2.0 Reference Tool export, which lists the informative references for every CSF 2.0
// subcategory. Only references to the exact document versions held in the library are kept; identifiers are
// resolved to Source Section IDs by publisher identifier. Import the result as a relationship file.
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
import { parseHeading } from "../src/lib/sources/headings";
import { idKey } from "../src/lib/sources/relations";

const NIST_EXPORT = "https://csrc.nist.gov/extensions/nudp/services/json/csf/download?olirids=all";
const CSF2 = /Cybersecurity Framework \(CSF\) 2\.0/;
/** Reference label in the NIST export -> library document it names (exact version only). */
const TARGETS: { label: string; framework: RegExp; id?: (s: string) => string }[] = [
  { label: "SP 800-53 Rev 5.1.1", framework: /SP 800-53 r5\.1\.1/ },
  { label: "CIS Controls v8.1", framework: /^CIS Controls v8\.1/ },
  { label: "CSF v1.1", framework: /Critical Infrastructure Cybersecurity v1\.1/ },
];

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: nist-csf-relationships.ts <out.xlsx> [nist-export.xlsx]");
  const buf = process.argv[3] ? readFileSync(process.argv[3]) : Buffer.from(await (await fetch(NIST_EXPORT)).arrayBuffer());
  const sheet = XLSX.read(buf).Sheets["CSF 2.0"];
  if (!sheet) throw new Error("Not a CSF 2.0 Reference Tool export (no “CSF 2.0” sheet).");
  const generated = XLSX.read(buf).Sheets["Introduction"]?.B5?.w ?? "";

  const fws = await prisma.framework.findMany({ select: { id: true, name: true } });
  const index = async (re: RegExp) => {
    const fw = fws.find((f) => re.test(f.name));
    if (!fw) return null;
    const cs = await prisma.citation.findMany({ where: { frameworkId: fw.id }, select: { sourceSectionId: true, sectionName: true } });
    const m = new Map<string, string>();
    for (const c of cs) { const k = idKey(parseHeading(c.sectionName).identifier ?? ""); if (k && !m.has(k)) m.set(k, c.sourceSectionId); }
    // A subcategory the library holds in parts (e.g. PR.AA-05-1, PR.AA-05-2) resolves to every part.
    return (key: string) => (m.has(key) ? [m.get(key)!] : [...m].filter(([k]) => k.startsWith(`${key}-`)).map(([, v]) => v));
  };
  const csf = await index(CSF2);
  if (!csf) throw new Error("NIST CSF 2.0 is not in the document library.");
  const targets = await Promise.all(TARGETS.map(async (t) => ({ ...t, ids: await index(t.framework) })));

  const rows: (string | null)[][] = [["Source ID A", "Source ID B", "Relationship", "Notes"]];
  const stats: Record<string, { linked: number; unresolved: Set<string> }> = {};
  const seen = new Set<string>();
  for (const r of XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null })) {
    const sub = String(r[2] ?? "").match(/^([A-Z]{2}\.[A-Z]{2}-\d+)/)?.[1];
    if (!sub) continue;
    const as = csf(idKey(sub));
    for (const line of String(r[4] ?? "").split("\n")) {
      const t = targets.find((x) => line.startsWith(`${x.label}:`));
      if (!t?.ids) continue;
      const ref = line.slice(t.label.length + 1).trim();
      const bs = t.ids(idKey(ref));
      const s = (stats[t.label] ??= { linked: 0, unresolved: new Set() });
      if (!as.length || !bs.length) { s.unresolved.add(as.length ? ref : sub); continue; }
      for (const a of as)
        for (const b of bs) {
          if (seen.has(`${a}|${b}`)) continue;
          seen.add(`${a}|${b}`);
          s.linked++;
          rows.push([a, b, "Informative reference", `NIST CSF 2.0 Reference Tool: ${sub} → ${t.label} ${ref}`]);
        }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Cross-framework");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Source", NIST_EXPORT], ["Publisher", "NIST, CSF 2.0 Reference Tool (informative references)"], ["NIST export generated", generated],
  ]), "About");
  writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  for (const [k, v] of Object.entries(stats)) console.log(`${k}: ${v.linked} links, ${v.unresolved.size} unresolved${v.unresolved.size ? ` (${[...v.unresolved].slice(0, 8).join(", ")})` : ""}`);
  console.log(`${rows.length - 1} relationships written to ${out}`);
}

main().finally(() => prisma.$disconnect());
