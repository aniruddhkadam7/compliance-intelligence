// Usage: npm run db:import -- [path/to/workbook.xlsx]
// Imports the CCF workbook through the same service the upload UI uses.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { prisma } from "../src/lib/db";
import { importCcfWorkbook } from "../src/lib/ingest/persist";

async function main() {
  const path = resolve(process.argv[2] ?? "data/source/CCF Demonstration.xlsx");
  const buffer = readFileSync(path);
  const started = Date.now();
  const { jobId, status, result } = await importCcfWorkbook(prisma, { name: basename(path), buffer }, "cli");

  console.log(`Import ${status} (${jobId}) in ${Date.now() - started} ms`);
  console.table(result.counts);
  const bySeverity = result.issues.reduce<Record<string, number>>((m, i) => ({ ...m, [i.severity]: (m[i.severity] ?? 0) + 1 }), {});
  console.log("Issues:", bySeverity);
  for (const i of result.issues.filter((x) => x.severity === "ERROR").slice(0, 20)) console.log(" ERROR", i.sheet, i.row ?? "", i.message);
  if (status !== "COMPLETED") process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
