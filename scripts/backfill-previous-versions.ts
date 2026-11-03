// Fills the "Previous version" record of each document and the blank law versions (see
// src/lib/sources/previous-versions.ts). Only empty fields are filled; nothing is deleted. Dry run unless
// --apply. The same action is available to admins in the app (Admin console).
//
//   npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/backfill-previous-versions.ts [--apply]
import { prisma } from "@/lib/db";
import { fillPreviousVersions } from "@/lib/sources/previous-versions";

(async () => {
  const apply = process.argv.includes("--apply");
  const r = await fillPreviousVersions(apply);
  for (const c of r.changes) console.log(`${apply ? "filled" : "would fill"} ${c.sourceId} ${c.name.slice(0, 60)}: ${c.fields.join(", ")}`);
  console.log(`${apply ? "Filled" : "Dry run: would fill"} ${r.changes.length} document(s).${apply ? "" : " Run with --apply to write."}`);
  await prisma.$disconnect();
})();
