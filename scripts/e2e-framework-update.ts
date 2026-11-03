// End-to-end test of the framework update workflow on a THROWAWAY database (refuses any other).
// Usage: DATABASE_URL=<test db on :5443> npx tsx scripts/e2e-framework-update.ts <CSF 2.0 PDF> <SP 800-53 xlsx>
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" }); config();

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`  ✔ ${msg}`); };

(async () => {
  if (!process.env.DATABASE_URL?.includes(":5443")) throw new Error("Refusing to run: DATABASE_URL is not the throwaway test database.");
  const [csfPdf, catalogXlsx] = process.argv.slice(2);
  const { prisma } = await import("../src/lib/db");
  const { checkForUpdates } = await import("../src/lib/updates/check");
  const { loadSampleControls } = await import("../src/lib/ingest/sample-controls");
  const { startIngestion, processNextChunk, publishIngestion } = await import("../src/lib/ai/ingest");
  const { generateProposals, versionUpdateDetail, revertPublication, listVersionUpdates } = await import("../src/lib/updates/impact");
  const { reviewProposal } = await import("../src/lib/queries/relationships");
  const { matrixPairs } = await import("../src/lib/queries/framework-matrix");
  const fw = (sourceId: string) => prisma.framework.findUniqueOrThrow({ where: { sourceId } });

  console.log("1. Sample client controls");
  const s = await loadSampleControls("e2e");
  ok(s.status === "COMPLETED" && s.counts.controls === 10, `10 sample controls imported (${JSON.stringify(s.counts)})`);
  await prisma.framework.delete({ where: { sourceId: "201" } }); // so CSF 2.0 is genuinely new for this test
  const csf11 = await fw("202");
  const mapped = await prisma.controlObligation.count({ where: { citation: { frameworkId: csf11.id } } });
  ok(mapped > 0, `${mapped} sample mappings to NIST CSF 1.1`);

  console.log("2. Check for Updates (real publisher)");
  const chk = await checkForUpdates(csf11.id, "e2e");
  ok(chk.status === "UPDATE_AVAILABLE" && /2/.test(chk.latestVersion ?? ""), `CSF 1.1: ${chk.status}, latest ${chk.latestVersion} (${chk.method})`);

  console.log("3. Upload the official CSF 2.0 PDF as the new version");
  let ing = await startIngestion({ name: "NIST.CSWP.29.pdf", buffer: readFileSync(csfPdf), kind: "pdf" }, "e2e", { frameworkId: csf11.id, expectedVersion: chk.latestVersion });
  while (ing.status === "EXTRACTING") ing = await processNextChunk(ing.id);
  ok(ing.status === "READY", `analysed (${ing.chunks} parts)`);
  const det = (await prisma.aiIngestion.findUniqueOrThrow({ where: { id: ing.id } }));
  const q = (det.detected as { quality: { sections: number; verified: number; warnings: string[]; byContentType: Record<string, number> }; checks: Record<string, unknown> }).quality;
  ok(q.sections >= 100 && q.verified / q.sections > 0.95, `${q.sections} sections, ${q.verified} verified; types ${JSON.stringify(q.byContentType)}`);
  console.log(`    checks ${JSON.stringify((det.detected as { checks: unknown }).checks)} · warnings: ${q.warnings.join(" | ") || "none"}`);
  const counts = (det.analysis as { counts: Record<string, number> }).counts;
  ok(counts.RENUMBERED + counts.MODIFIED + counts.UNCHANGED > 0 && counts.ADDED > 0, `relations ${JSON.stringify(counts)}`);
  const pages = await prisma.aiDraftSection.count({ where: { ingestionId: ing.id, pageNumber: { not: null } } });
  ok(pages === q.sections || pages >= q.verified, `${pages} sections carry a page number`);

  console.log("4. Approve and publish as a new version");
  const before = await prisma.controlObligation.count();
  const pub = await publishIngestion(ing.id, { mode: "NEW_VERSION", parentSourceId: "201", name: "NIST Cybersecurity Framework (CSF) 2.0", versionLabel: "2.0", note: "e2e approval" }, "reviewer");
  ok(pub.added > 0, `published ${pub.added} sections as a new document; previous version kept: ${!!(await prisma.framework.findUnique({ where: { id: csf11.id } }))}`);
  const gen = await generateProposals(ing.id, "reviewer");
  ok(gen.created > 0, `${gen.created} mapping proposals created`);
  ok((await prisma.controlObligation.count()) === before, "no live mapping changed before approval");
  ok((await generateProposals(ing.id, "reviewer")).created === 0, "proposal generation is idempotent");

  console.log("5. Change Analytics");
  const d = await versionUpdateDetail(ing.id);
  ok(d.affectedControls.length > 0, `${d.affectedControls.length} affected, ${d.unaffectedControls.length} unaffected controls; ${d.newlyUnmapped.length} new requirements unmapped`);
  ok(Object.keys(d.matrix).length > 0, `matrix domains: ${Object.keys(d.matrix).join(", ")}`);
  const kinds = d.proposals.reduce((m, p) => ({ ...m, [p.changeType ?? "?"]: (m[p.changeType ?? "?"] ?? 0) + 1 }), {} as Record<string, number>);
  console.log(`    proposals by change: ${JSON.stringify(kinds)} · example: ${d.proposals[0].control.controlName} → ${d.proposals[0].section} (${d.proposals[0].changeType}, ${Math.round((d.proposals[0].confidence ?? 0) * 100)}%)`);

  console.log("6. Review: approve some, reject one");
  const adds = d.proposals.filter((p) => p.action === "ADD");
  for (const p of adds.slice(0, 3)) await reviewProposal(p.id, "APPROVED", "reviewer", "e2e");
  if (adds[3]) await reviewProposal(adds[3].id, "REJECTED", "reviewer", "e2e");
  const after = await prisma.controlObligation.count();
  ok(after === before + new Set(adds.slice(0, 3).map((p) => `${p.control.id}|${p.section}`)).size, `approved proposals became live mappings (${before} → ${after})`);
  const flag = d.proposals.find((p) => p.action === "FLAG_REMOVED");
  if (flag) { const c0 = await prisma.controlObligation.count(); await reviewProposal(flag.id, "APPROVED", "reviewer"); ok((await prisma.controlObligation.count()) === c0, "acknowledging a removed requirement keeps the previous mapping"); }
  const pairs = await matrixPairs("controls");
  ok(pairs.some((p) => [p.a.short, p.b.short].some((n) => /CSF 2/.test(n))), `Framework Matrix now links CSF 2.0: ${pairs.map((p) => `${p.a.short}~${p.b.short}:${p.links}`).join(", ")}`);
  ok((await listVersionUpdates())[0].pendingProposals === d.proposals.length - 3 - (adds[3] ? 1 : 0) - (flag ? 1 : 0), "pending count reflects decisions");
  try { await revertPublication(ing.id, "reviewer"); ok(false, "revert should be blocked"); } catch (e) { ok(/Approved mapping|mapping/.test((e as Error).message), `revert blocked once mappings depend on it: ${(e as Error).message}`); }

  console.log("7. Excel upload, publish and revert (rollback)");
  const sp = await fw("204");
  let x = await startIngestion({ name: "sp800-53r5-control-catalog.xlsx", buffer: readFileSync(catalogXlsx), kind: "xlsx" }, "e2e", { frameworkId: sp.id, expectedVersion: "5.2.0" });
  ok(x.status === "READY" || (await prisma.aiIngestion.findUniqueOrThrow({ where: { id: x.id } })).status === "READY", "spreadsheet analysed without chunked extraction");
  x = await prisma.aiIngestion.findUniqueOrThrow({ where: { id: x.id } });
  const xq = (x.detected as { quality: { warnings: string[] } }).quality;
  ok(xq.warnings.some((w) => /not the expected/.test(w)), "version mismatch with the expected 5.2.0 is flagged");
  const xp = await publishIngestion(x.id, { mode: "NEW_VERSION", parentSourceId: "206", versionLabel: "5.1" }, "reviewer");
  ok(!!(await prisma.framework.findUnique({ where: { sourceId: "206" } })), `published as document 206 (${xp.added} sections)`);
  await generateProposals(x.id, "reviewer");
  await revertPublication(x.id, "reviewer");
  ok(!(await prisma.framework.findUnique({ where: { sourceId: "206" } })) && (await prisma.aiIngestion.findUniqueOrThrow({ where: { id: x.id } })).status === "REVERTED", "revert removed the new version; the approved 5.1.1 remains");
  ok(!!(await prisma.framework.findUnique({ where: { sourceId: "204" } })), "previous version intact");

  const audit = await prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } });
  console.log("8. Audit trail:", audit.map((a) => `${a.action}×${a._count._all}`).join(", "));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
