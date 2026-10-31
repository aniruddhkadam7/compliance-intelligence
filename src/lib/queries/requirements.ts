import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";

export async function getRequirement(requirementId: string) {
  const r = await prisma.integratedRequirement.findFirst({
    where: { OR: [{ requirementId }, { id: requirementId }] },
    include: {
      citations: {
        include: { citation: { include: { framework: { select: { id: true, name: true, sourceId: true, versionLabel: true } } } } },
      },
      mappings: { include: { control: { select: { id: true, controlName: true, title: true, category: true } } }, orderBy: { mappingType: "asc" } },
      reviews: { orderBy: { sheetName: "asc" } },
    },
  });
  if (!r) return null;

  const byFramework = new Map<string, { framework: { id: string; name: string; short: string; sourceId: string }; citations: { id: string; sourceSectionId: string; sectionName: string }[] }>();
  for (const { citation: c } of r.citations) {
    const e = byFramework.get(c.framework.id) ?? { framework: { ...c.framework, short: shortName(c.framework.name) }, citations: [] };
    e.citations.push({ id: c.id, sourceSectionId: c.sourceSectionId, sectionName: c.sectionName });
    byFramework.set(c.framework.id, e);
  }
  const groups = [...byFramework.values()].sort((a, b) => b.citations.length - a.citations.length);
  groups.forEach((g) => g.citations.sort((a, b) => a.sectionName.localeCompare(b.sectionName)));

  return {
    ...r,
    citationGroups: groups,
    authoritativeMappings: r.mappings.filter((m) => m.authoritative),
    workingMappings: r.mappings.filter((m) => !m.authoritative),
    citationCount: r.citations.length,
  };
}
