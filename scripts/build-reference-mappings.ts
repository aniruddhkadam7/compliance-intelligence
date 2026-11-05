// Builds src/data/cross-framework-mapping.json from the team's "Cross-Framework Mapping (All Sources)" workbook.
//
//   npx tsx scripts/build-reference-mappings.ts "<path to workbook.xlsx>"
//
// The workbook has one sheet per framework: its first column lists that framework's Source Section IDs and every
// other column the related Source Section IDs in another framework. This keeps only what the workbook states:
// distinct unordered section pairs between two different documents, plus which document each Source ID belongs to
// (from its "Citation Sources" sheet) so the loader can refuse IDs that mean a different document in the database
// it loads into. Commit the generated file; the app loads it by itself (src/lib/reference/mappings.ts).
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { documentKey } from "../src/lib/frameworks";

const OUT = "src/data/cross-framework-mapping.json";
const SERIAL = /^(sl\.?\s*no\.?|s\.?\s*no\.?|#|no\.?|row|serial( no\.?)?)$/i;
const ids = (cell: unknown) => String(cell ?? "").split(/[\s,;/:]+/).filter((t) => /^\d+$/.test(t));

const path = process.argv[2];
if (!path) throw new Error('Usage: build-reference-mappings.ts "<workbook.xlsx>"');
const buf = readFileSync(path);
const wb = XLSX.read(buf);
const rows = (name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: null, blankrows: false });

// Which document each Source Section ID belongs to. Large documents run past their number range (SP 800-53's
// sections continue into 205xxx), so the ID is looked up, never inferred from its first digits.
const parents: Record<string, string> = {}; // Parent Source ID -> document (family and version)
const sections: Record<string, number[]> = {}; // Parent Source ID -> its Source Section IDs
const sidParent = new Map<string, string>();
for (const r of rows("Citation Sources")) {
  const parent = String(r["Parent Source ID"] ?? "").trim(), sid = String(r["Source Section ID"] ?? "").trim();
  if (!parent || !/^\d+$/.test(sid)) continue;
  if (sidParent.has(sid)) throw new Error(`Source Section ID ${sid} is listed twice in Citation Sources.`);
  sidParent.set(sid, parent);
  parents[parent] ??= documentKey(String(r["Authoritative Source"] ?? ""));
  (sections[parent] ??= []).push(Number(sid));
}
for (const list of Object.values(sections)) list.sort((x, y) => x - y);
const parentOf = (sid: string) => sidParent.get(sid);

const pairs = new Map<number, Set<number>>();
let sheets = 0, stated = 0;
const unknownIds = new Set<string>();
for (const name of wb.SheetNames) {
  if (name === "Template" || name === "Citation Sources") continue;
  const data = rows(name);
  const cols = Object.keys(data[0] ?? {}).filter((h) => !SERIAL.test(h.trim()));
  if (cols.length < 2 || data.length < 3) continue;
  sheets++;
  const [key, ...others] = cols;
  for (const r of data)
    for (const a of ids(r[key]))
      for (const col of others)
        for (const b of ids(r[col])) {
          stated++;
          if (a === b) continue;
          const pa = parentOf(a), pb = parentOf(b);
          if (!pa || !pb) { if (!pa) unknownIds.add(a); if (!pb) unknownIds.add(b); continue; } // not in the workbook's own library
          if (pa === pb) continue; // two sections of one document are not a framework relationship
          const [lo, hi] = Number(a) < Number(b) ? [Number(a), Number(b)] : [Number(b), Number(a)];
          (pairs.get(lo) ?? pairs.set(lo, new Set()).get(lo)!).add(hi);
        }
}
const mappings = Object.fromEntries([...pairs].sort((x, y) => x[0] - y[0]).map(([a, set]) => [a, [...set].sort((x, y) => x - y)]));
const total = [...pairs.values()].reduce((n, s) => n + s.size, 0);
const out = {
  source: basename(path),
  version: createHash("sha256").update(buf).digest("hex").slice(0, 12),
  parents,
  sections,
  mappings,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`${sheets} mapping sheets, ${stated} stated links -> ${total} distinct section pairs between different documents`);
console.log(`documents: ${Object.keys(parents).length}, sections: ${sidParent.size}; IDs not in the workbook's own library (skipped): ${unknownIds.size}`);
console.log(`wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB), version ${out.version}`);
