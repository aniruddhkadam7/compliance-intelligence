// Builds src/data/framework-update-impact.json from the team's "Change Analytics" workbook.
//
//   npx tsx scripts/build-update-impact.ts "<path to Change Analytics.xlsx>"
//
// The workbook has one sheet per framework (ISO 27701, ISO 27001, ISO 27002, NIST CSF, CIS Control) listing every
// client test procedure with the Source Section IDs it maps to under the legacy version and under the latest
// version. Its last column is IF(legacy = latest, "Yes", "No"): "No" is a test procedure whose mapping changed.
// This keeps, per framework, only the changed test procedures with the sections removed from and added to their
// mapping, and labels every section (publisher identifier, title, document) so the app needs no library lookup.
// Commit the generated file; Change Analytics reads it (src/lib/updates/reference-impact.ts).
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { shortName } from "../src/lib/frameworks";
import { parseHeading } from "../src/lib/sources/headings";

const OUT = "src/data/framework-update-impact.json";
/** The framework updates shown, in this order: key, family label, versions, and the workbook sheet that holds them. */
const UPDATES = [
  { key: "iso-27701", family: "ISO/IEC 27701", previous: "2019", current: "2025", sheet: "ISO 27701" },
  { key: "iso-27001", family: "ISO/IEC 27001", previous: "2013", current: "2022", sheet: "ISO 27001" },
  { key: "iso-27002", family: "ISO/IEC 27002", previous: "2013", current: "2022", sheet: "ISO 27002" },
  { key: "nist-csf", family: "NIST CSF", previous: "1.1", current: "2.0", sheet: "NIST CSF" },
  { key: "cis-controls", family: "CIS Controls", previous: "v8", current: "v8.1", sheet: "CIS Control" },
];
const ids = (cell: unknown) => String(cell ?? "").split(/[\s,;:]+/).filter((t) => /^\d+$/.test(t));
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

const path = process.argv[2];
if (!path) throw new Error('Usage: build-update-impact.ts "<Change Analytics.xlsx>"');
const buf = readFileSync(path);
const wb = XLSX.read(buf);
const rows = (name: string) => {
  if (!wb.Sheets[name]) throw new Error(`Sheet "${name}" not found.`);
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null, blankrows: false }).slice(1);
};

// The workbook's own library: document and label for every Source Section ID.
const docs: Record<string, string> = {};
const library = new Map<string, { parent: string; name: string; description: string }>();
for (const r of rows("Citation Sources")) {
  const [parent, source, sid, name, description] = r as string[];
  library.set(String(sid), { parent: String(parent), name: String(name ?? ""), description: String(description ?? "") });
  docs[String(parent)] ??= shortName(String(source ?? ""));
}
/** "11.300b Controls for ..." and "5.1.1 Policies ..." are a number plus a title; keep the number as the identifier. */
function label(sid: string) {
  const s = library.get(sid);
  if (!s) return null;
  const full = parseHeading(s.name).identifier ?? s.name;
  const lead = full.match(/^(\S*\d\S*)\s+(\S.*)$/);
  const identifier = lead ? lead[1] : full;
  const text = s.description.startsWith(s.name) ? s.description.slice(s.name.length).replace(/^[\s\-–:]+/, "") : s.description;
  return [s.parent, identifier, clip(lead ? lead[2] : text.replace(/\s+/g, " "), 120)] as const;
}

// Controls and test procedures in the base mapping sheet.
const base = rows("Metrics(Hidden)") as string[][];
const controls: Record<string, number> = {};
for (const r of base) controls[String(r[0])] = (controls[String(r[0])] ?? 0) + 1;
const tpText: Record<string, string> = {};
const baseTps = new Set(base.map((r) => String(r[1])));

const sections: Record<string, readonly [string, string, string]> = {};
const unknown = new Set<string>();
const updates = UPDATES.map((u) => {
  const changed: [string, string, number[], number[]][] = [];
  let total = 0, mismatch = 0;
  for (const r of rows(u.sheet) as unknown[][]) {
    total++;
    const [control, tp, text, legacy, , latest, , flag] = r as string[];
    if (!baseTps.has(String(tp))) throw new Error(`${u.sheet}: test procedure ${tp} is not in the base sheet.`);
    const d = new Set(ids(legacy)), f = new Set(ids(latest));
    const removed = [...d].filter((s) => !f.has(s)), added = [...f].filter((s) => !d.has(s));
    const differs = removed.length + added.length > 0;
    if ((flag === "No") !== differs) mismatch++;
    if (flag !== "No") continue;
    for (const s of [...removed, ...added]) { const l = label(s); if (l) sections[s] = l; else unknown.add(s); }
    tpText[String(tp)] = String(text ?? "").replace(/\s+/g, " ").trim();
    changed.push([String(control), String(tp), removed.map(Number), added.map(Number)]);
  }
  console.log(`${u.sheet}: ${changed.length} of ${total} test procedures changed across ${new Set(changed.map((c) => c[0])).size} controls${mismatch ? ` (WARNING: ${mismatch} rows where Yes/No disagrees with the section lists)` : ""}`);
  return { ...u, changed };
});
if (unknown.size) console.log(`WARNING: ${unknown.size} section IDs are not in the workbook's library and will show without a label.`);

const out = {
  source: basename(path),
  version: createHash("sha256").update(buf).digest("hex").slice(0, 12),
  totalTestProcedures: baseTps.size,
  controls,
  docs,
  sections,
  tpText,
  updates,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`${Object.keys(controls).length} controls, ${baseTps.size} test procedures; wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB), version ${out.version}`);
