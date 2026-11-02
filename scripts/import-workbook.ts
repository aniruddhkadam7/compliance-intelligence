// Usage: npm run db:import -- <library|controls|relationships> [path/to/workbook.xlsx]
// Imports through the same service the upload UI uses.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { prisma } from "../src/lib/db";
import { confirmImport, type ImportKind } from "../src/lib/ingest/persist";

const KINDS: Record<string, ImportKind> = { library: "LIBRARY", controls: "CLIENT_CONTROLS", relationships: "RELATIONSHIPS" };

async function main() {
  const kind = KINDS[process.argv[2] ?? ""];
  if (!kind) throw new Error("First argument must be library, controls or relationships.");
  const path = resolve(process.argv[3] ?? "data/source/CCF Demonstration.xlsx");
  const started = Date.now();
  const out = await confirmImport(prisma, kind, { name: basename(path), buffer: readFileSync(path) }, "cli");

  console.log(`${kind} import ${out.status} (${out.jobId}) in ${Date.now() - started} ms`);
  console.table(out.counts);
  const bySeverity = out.issues.reduce<Record<string, number>>((m, i) => ({ ...m, [i.severity]: (m[i.severity] ?? 0) + 1 }), {});
  console.log("Issues:", bySeverity);
  for (const i of out.issues.filter((x) => x.severity !== "INFO").slice(0, 20)) console.log(` ${i.severity}`, i.sheet ?? "", i.row ?? "", i.message.slice(0, 200));
  if (out.status !== "COMPLETED") process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
