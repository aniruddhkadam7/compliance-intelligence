// Builds src/data/change-summaries.json from the team's "Summary of changes" workbook.
//
//   npx tsx scripts/build-change-summaries.ts "<path to Summary_of_changes_FWs_Stds.xlsx>"
//
// Sheet "SoC" has one row per framework upgrade (Legacy -> Latest) with a summary and the affected sections, domains,
// merged and removed sections. Each Legacy name is matched to a library Source ID through the names in
// src/data/publication-dates.json (the Authoritative Sources sheet), so Sources can show the summary on the right row.
// Commit the generated file.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import publication from "../src/data/publication-dates.json";

const OUT = "src/data/change-summaries.json";
const path = process.argv[2];
if (!path) throw new Error('Usage: build-change-summaries.ts "<Summary_of_changes xlsx>"');
const buf = readFileSync(path);
const wb = XLSX.read(buf);
const sheet = wb.SheetNames.find((n) => /^soc$/i.test(n.trim())) ?? wb.SheetNames[0];
const [header, ...rows] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });

// Columns by their heading, so a reordered sheet still reads correctly.
const col = (re: RegExp) => {
  const i = (header as unknown[]).findIndex((h) => re.test(String(h ?? "")));
  if (i < 0) throw new Error(`Column matching ${re} not found in "${sheet}".`);
  return i;
};
const C = { legacy: col(/^legacy/i), latest: col(/^latest/i), upgrade: col(/major|minor/i), summary: col(/^summary/i), affected: col(/affected/i), domains: col(/domains/i), merged: col(/merged/i), removed: col(/removed/i) };
const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const idByName = new Map(Object.entries(publication.names as Record<string, string>).map(([id, name]) => [key(name), id]));

const items = rows.filter((r) => text(r[C.legacy])).map((r) => ({
  legacySourceId: idByName.get(key(text(r[C.legacy]))) ?? null,
  legacy: text(r[C.legacy]), latest: text(r[C.latest]), upgrade: text(r[C.upgrade]),
  summary: text(r[C.summary]), affected: text(r[C.affected]), domains: text(r[C.domains]), merged: text(r[C.merged]), removed: text(r[C.removed]),
}));
for (const i of items) console.log(`${(i.legacySourceId ?? "—").padEnd(5)} ${i.legacy} -> ${i.latest} (${i.upgrade})`);
const unmatched = items.filter((i) => !i.legacySourceId);
if (unmatched.length) console.log(`WARNING: ${unmatched.length} row(s) not matched to a Source ID: ${unmatched.map((i) => i.legacy).join(", ")}`);

writeFileSync(OUT, JSON.stringify({ source: basename(path), version: createHash("sha256").update(buf).digest("hex").slice(0, 12), items }, null, 1));
console.log(`${items.length} summaries -> ${OUT}`);
