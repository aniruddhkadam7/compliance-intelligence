// Demonstration data: for every control whose test procedures cite NIST CSF 1.1, also link the same test
// procedure to the matching NIST CSF 2.0 sections, so both versions appear as separate frameworks in the
// traceability view. The crosswalk below is a best-effort reading of NIST's CSF 1.1 -> 2.0 correspondence and is
// ILLUSTRATIVE, NOT a recorded GSK mapping: the team has said some data needs validation. Rows are written with
// ControlObligation.mappingType = "DEMO" so the UI labels them and they can be removed again.
// Nothing existing is changed or deleted. Dry run unless --apply; --remove deletes only the DEMO rows.
//
//   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/seed-nist-demo.ts [--apply | --remove]
import { prisma } from "@/lib/db";
import { DEMO_MAPPING } from "@/lib/queries/controls";

const CSF_11 = "202";
const CSF_20 = "201";

/** CSF 1.1 subcategory -> CSF 2.0 subcategory(ies). Split 1.1 items ("-1"/"-2") map to the split 2.0 items. */
const CROSSWALK: Record<string, string[]> = {
  "DE.AE-3": ["DE.AE-03"],
  "DE.CM-1": ["DE.CM-01"],
  "DE.DP-5": ["ID.IM-03"],
  "ID.AM-3": ["ID.AM-03"],
  "ID.AM-6": ["GV.RR-02"],
  "ID.GV-2": ["GV.RR-02", "GV.SC-02"],
  "ID.SC-1": ["GV.SC-01", "GV.SC-06"],
  "ID.SC-2": ["GV.SC-04", "ID.RA-10"],
  "ID.SC-4": ["GV.SC-07"],
  "PR.AC-1": ["PR.AA-01", "PR.AA-02"],
  "PR.AC-4-1": ["PR.AA-05-1"],
  "PR.AC-4-2": ["PR.AA-05-2"],
  "PR.AC-5": ["PR.IR-01"],
  "PR.AC-7": ["PR.AA-03"],
  "PR.DS-2": ["PR.DS-02"],
  "PR.DS-3": ["ID.AM-08", "PR.PS-03"],
  "PR.DS-7": ["PR.IR-01"],
  "PR.IP-1": ["PR.PS-01"],
  "PR.IP-3": ["ID.RA-07"],
  "PR.IP-7": ["ID.IM-03"],
  "PR.MA-2": ["PR.PS-02"],
  "PR.PT-1": ["PR.PS-04"],
  "PR.PT-2": ["PR.DS-01"],
  "PR.PT-3": ["PR.PS-01"],
  "PR.PT-4": ["PR.IR-01"],
  "RS.CO-2": ["RS.CO-02"],
  "RS.CO-4": ["RS.CO-03"],
  "RS.MI-1": ["RS.MI-01"],
  "RS.MI-2": ["RS.MI-02"],
};

const idOf = (sectionName: string) => sectionName.split(" - ").slice(-1)[0];

(async () => {
  if (process.argv.includes("--remove")) {
    const tpo = await prisma.$executeRaw`
      DELETE FROM "TestProcedureObligation" t USING "TestProcedure" p, "ControlObligation" o
      WHERE p.id = t."testProcedureId" AND o."controlId" = p."controlId" AND o."citationId" = t."citationId" AND o."mappingType" = ${DEMO_MAPPING}`;
    const co = await prisma.controlObligation.deleteMany({ where: { mappingType: DEMO_MAPPING } });
    console.log(`Removed ${co.count} demonstration control link(s) and ${tpo} test-procedure link(s).`);
    return;
  }
  const apply = process.argv.includes("--apply");

  const v20 = new Map((await prisma.citation.findMany({ where: { framework: { sourceId: CSF_20 } }, select: { id: true, sectionName: true } })).map((c) => [idOf(c.sectionName), c.id]));
  const links = await prisma.testProcedureObligation.findMany({
    where: { citation: { framework: { sourceId: CSF_11 } }, testProcedure: { kind: "PROCEDURE" } },
    select: { testProcedureId: true, testProcedure: { select: { controlId: true } }, citation: { select: { sectionName: true } } },
  });

  const tpLinks = new Map<string, { testProcedureId: string; citationId: string }>();
  const ctlLinks = new Map<string, { controlId: string; citationId: string }>();
  const unmapped = new Set<string>();
  for (const l of links) {
    const src = idOf(l.citation.sectionName);
    for (const target of CROSSWALK[src] ?? []) {
      const citationId = v20.get(target);
      if (!citationId) { unmapped.add(`${src} -> ${target}`); continue; }
      tpLinks.set(`${l.testProcedureId}:${citationId}`, { testProcedureId: l.testProcedureId, citationId });
      ctlLinks.set(`${l.testProcedure.controlId}:${citationId}`, { controlId: l.testProcedure.controlId, citationId });
    }
    if (!CROSSWALK[src]) unmapped.add(`${src} -> (no crosswalk entry)`);
  }
  if (unmapped.size) console.log("Skipped:", [...unmapped].join("; "));

  if (apply) {
    await prisma.controlObligation.createMany({ data: [...ctlLinks.values()].map((l) => ({ ...l, mappingType: DEMO_MAPPING })), skipDuplicates: true });
    await prisma.testProcedureObligation.createMany({ data: [...tpLinks.values()], skipDuplicates: true });
  }
  console.log(`${apply ? "Wrote" : "Dry run: would write"} ${ctlLinks.size} control link(s) and ${tpLinks.size} test-procedure link(s) to NIST CSF 2.0 (DEMO).${apply ? "" : " Run with --apply to write."}`);
  await prisma.$disconnect();
})();
