import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";

export async function globalSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const contains = { contains: term, mode: "insensitive" as const };
  const [frameworks, controls, requirements, citations] = await Promise.all([
    prisma.framework.findMany({ where: { OR: [{ name: contains }, { sourceId: term }] }, take: 4, select: { id: true, name: true, type: true } }),
    prisma.ccfControl.findMany({ where: { OR: [{ controlName: contains }, { title: contains }] }, take: 6, select: { id: true, controlName: true, title: true } }),
    prisma.integratedRequirement.findMany({ where: { OR: [{ requirementId: term }, { name: contains }] }, take: 5, select: { requirementId: true, name: true, riskTopic: true } }),
    prisma.citation.findMany({ where: { OR: [{ sourceSectionId: term }, { sectionName: contains }] }, take: 6, select: { id: true, sourceSectionId: true, sectionName: true } }),
  ]);
  return [
    ...frameworks.map((f) => ({ type: "framework" as const, id: f.id, label: shortName(f.name), sublabel: f.name, href: `/frameworks/${f.id}` })),
    ...controls.map((c) => ({ type: "control" as const, id: c.id, label: c.controlName, sublabel: c.title ?? "", href: `/controls/${encodeURIComponent(c.controlName)}` })),
    ...requirements.map((r) => ({ type: "requirement" as const, id: r.requirementId, label: `IR ${r.requirementId} · ${r.name ?? ""}`, sublabel: r.riskTopic ?? "", href: `/requirements/${r.requirementId}` })),
    ...citations.map((c) => ({ type: "citation" as const, id: c.id, label: c.sectionName.split(" - ").slice(-1)[0], sublabel: `Section ${c.sourceSectionId} · ${c.sectionName}`, href: `/citations?citation=${c.sourceSectionId}` })),
  ];
}
