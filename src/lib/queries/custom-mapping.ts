// The uploaded custom controls (the CCF) against the framework library: which sections of each framework every custom
// control is mapped to, as stated in the uploaded mapping workbook. Nothing is inferred. Only the framework version each
// control currently points to is used (see control-links.ts), so a demo update shows up once approved.
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { sectionView } from "./framework-matrix";
import { visibleLinks } from "./control-links";

/** The pseudo-framework id the Relationship Graph uses for the custom controls. */
export const CUSTOM_ID = "custom";
export const CUSTOM_LABEL = "Custom controls (CCF)";

const byId = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
const clip = (t: string | null, n: number) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Visible control → section links with the section wording and the control's title and statement. */
async function links() {
  const rows = await visibleLinks();
  if (!rows.length) return { rows, sections: new Map(), controls: new Map(), frameworks: new Map() };
  const [sections, controls, frameworks] = await Promise.all([
    prisma.citation.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.citationId))] } }, select: { id: true, sourceSectionId: true, sectionName: true, sectionText: true } }),
    prisma.ccfControl.findMany({ select: { id: true, controlName: true, domainPrefix: true, title: true, objective: true, activityStatementV2: true } }),
    prisma.framework.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.frameworkId))] } }, select: { id: true, name: true, type: true } }),
  ]);
  return {
    rows,
    sections: new Map(sections.map((s) => [s.id, sectionView(s.id, s.sourceSectionId, s.sectionName, s.sectionText)])),
    controls: new Map(controls.map((c) => [c.id, c])),
    frameworks: new Map(frameworks.map((f) => [f.id, { id: f.id, short: shortName(f.name), type: f.type }])),
  };
}

/** Number of custom-control → section links per framework, for the Relationship Graph's target list. */
export async function customCounts() {
  const rows = await visibleLinks();
  const per = new Map<string, Set<string>>();
  for (const r of rows) per.set(r.frameworkId, (per.get(r.frameworkId) ?? new Set()).add(`${r.controlId}|${r.citationId}`));
  return { controls: await prisma.ccfControl.count(), counts: Object.fromEntries([...per].map(([fw, s]) => [fw, s.size])) as Record<string, number> };
}

/** Custom controls against one framework, in the Relationship Graph's shape: each pair joins a control and a section. */
export async function customConnection(frameworkId: string) {
  const l = await links();
  const pairs = l.rows.filter((r) => r.frameworkId === frameworkId).flatMap((r) => {
    const c = l.controls.get(r.controlId), s = l.sections.get(r.citationId);
    if (!c || !s) return [];
    const control = {
      id: c.id, sourceSectionId: c.controlName, identifier: c.controlName, domain: c.domainPrefix || "Other",
      title: c.title ?? "", description: clip(c.objective ?? c.activityStatementV2 ?? null, 400),
      href: `/controls/${encodeURIComponent(c.controlName)}` as string | null,
    };
    return [{ a: control, b: s, types: [] as string[] }];
  }).sort((x, y) => byId(x.a.identifier, y.a.identifier) || byId(x.b.identifier, y.b.identifier));
  return { a: { id: CUSTOM_ID, short: CUSTOM_LABEL, type: null }, b: l.frameworks.get(frameworkId) ?? null, basis: "controls" as const, links: pairs.length, sections: pairs };
}

/**
 * CCF cross mapping: one row per custom control with the sections it maps to in each framework. Control level only:
 * no test procedures or obligation wording.
 */
export async function ccfCrossMapping() {
  const l = await links();
  const all = await prisma.ccfControl.findMany({ select: { id: true, controlName: true, title: true } });
  const cells = new Map<string, Map<string, { identifier: string; title: string; sourceSectionId: string }[]>>();
  const perFramework = new Map<string, Set<string>>();
  for (const r of l.rows) {
    const s = l.sections.get(r.citationId);
    if (!s) continue;
    const byFw = cells.get(r.controlId) ?? new Map();
    const list = byFw.get(r.frameworkId) ?? [];
    if (!list.some((x: { sourceSectionId: string }) => x.sourceSectionId === s.sourceSectionId)) list.push({ identifier: s.identifier, title: s.title, sourceSectionId: s.sourceSectionId });
    byFw.set(r.frameworkId, list);
    cells.set(r.controlId, byFw);
    perFramework.set(r.frameworkId, (perFramework.get(r.frameworkId) ?? new Set()).add(r.controlId));
  }
  const frameworks = [...perFramework].map(([id, controls]) => ({ ...l.frameworks.get(id)!, controls: controls.size })).filter((f) => f.id)
    .sort((a, b) => b.controls - a.controls || a.short.localeCompare(b.short));
  return {
    frameworks,
    controls: all.sort((a, b) => byId(a.controlName, b.controlName)).map((c) => ({
      name: c.controlName, title: c.title,
      mappings: Object.fromEntries([...(cells.get(c.id) ?? new Map())].map(([fw, list]) => [fw, list.sort((x: { identifier: string }, y: { identifier: string }) => byId(x.identifier, y.identifier))])) as Record<string, { identifier: string; title: string; sourceSectionId: string }[]>,
    })),
  };
}
export type CcfCrossMapping = Awaited<ReturnType<typeof ccfCrossMapping>>;
