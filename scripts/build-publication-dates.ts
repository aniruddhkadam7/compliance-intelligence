// Builds src/data/publication-dates.json from the team's "CCF Demonstration" workbook.
//
//   npx tsx scripts/build-publication-dates.ts "<path to CCF Demonstration(...).xlsx>"
//
// The "Authoritative Sources" sheet lists every document with its Parent Source ID (column E) and Publication Date
// (column F, an Excel date). Sources shows these as each document's "Last published date", keyed by Source ID.
// Commit the generated file.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";

const OUT = "src/data/publication-dates.json";
const path = process.argv[2];
if (!path) throw new Error('Usage: build-publication-dates.ts "<CCF Demonstration xlsx>"');
const buf = readFileSync(path);
const wb = XLSX.read(buf);
const sheet = wb.SheetNames.find((n) => /authoritative sources/i.test(n));
if (!sheet) throw new Error('Sheet "Authoritative Sources" not found.');
const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false }).slice(1);

/** Excel serial day number -> yyyy-mm-dd. */
const fromSerial = (n: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);

const dates: Record<string, string> = {};
const names: Record<string, string> = {};
for (const r of rows) {
  const id = r[4] == null ? "" : String(r[4]).trim();
  const serial = r[5];
  if (!id || typeof serial !== "number") continue;
  dates[id] = fromSerial(serial);
  names[id] = String(r[1] ?? "").trim();
}
writeFileSync(OUT, JSON.stringify({ source: basename(path), version: createHash("sha256").update(buf).digest("hex").slice(0, 12), dates, names }, null, 1));
console.log(`${Object.keys(dates).length} publication dates from "${sheet}" -> ${OUT}`);
for (const [id, d] of Object.entries(dates)) console.log(" ", id.padEnd(5), d, names[id]);
