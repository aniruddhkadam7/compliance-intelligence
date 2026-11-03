// Loads the ten labelled sample controls through the normal client import (validation, audit, history).
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { confirmImport } from "./persist";
import { buildTemplate, SAMPLE_CONTROLS } from "./client-template";
import { parseHeading } from "@/lib/sources/headings";

/** Only allowed while no client controls exist, so real client data is never replaced by samples. */
export async function loadSampleControls(actor: string) {
  if (await prisma.ccfControl.count()) throw new HttpError(409, "Client controls already exist. Sample controls can only be loaded into an empty client layer.");
  const frameworks = await prisma.framework.findMany({ where: { sourceId: { in: [...new Set(SAMPLE_CONTROLS.flatMap((c) => c.sections.map((s) => s.framework)))] } }, select: { sourceId: true, name: true, citations: { select: { sourceSectionId: true, sectionName: true } } } });
  const resolve = (fw: string, ident: string) => frameworks.find((f) => f.sourceId === fw)?.citations.find((c) => parseHeading(c.sectionName).identifier === ident)?.sourceSectionId ?? null;
  const rows = SAMPLE_CONTROLS.map((c) => {
    const ids = c.sections.flatMap((s) => s.ids.map((i) => resolve(s.framework, i))).filter(Boolean);
    const fws = c.sections.map((s) => frameworks.find((f) => f.sourceId === s.framework)?.name.split(" - ")[0]).filter(Boolean);
    return [c.id, `${c.name} (sample)`, `${c.description} Sample control for demonstration; not client data.`, `${c.id}:TP1`, c.procedure, fws.join("; "), ids.join(", ")];
  });
  const out = await confirmImport(prisma, "CLIENT_CONTROLS", { name: "sample-client-controls.xlsx", buffer: buildTemplate(rows) }, actor);
  if (out.status === "FAILED") throw new HttpError(422, "The sample controls could not be imported.", out.issues.filter((i) => i.severity === "ERROR").slice(0, 20));
  return out;
}
