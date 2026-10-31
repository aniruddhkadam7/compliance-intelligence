// Version impact analysis. Everything returned is derived from imported data:
//  - citation coverage per integrated requirement in the old vs new framework version
//  - per-control direct references stated in version-specific crosswalk columns
//  - transition records from the team's transition workbook (when imported)
// No mapping is created or altered here.

import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";

/**
 * Working-sheet crosswalk columns that state references for a specific framework version.
 * Keyed by derived framework family, then version label.
 */
export const VERSIONED_REFERENCE_COLUMNS: Record<string, Record<string, string>> = {
  "NIST CSF": { "1.1": "NIST CSF 1.1", "2.0": "NIST CSF 2.0" },
};

/** "NIST CSF v2.0 - Govern (GV) - Organizational Context (GV.OC) - GV.OC-01" → "Govern (GV)". */
export const functionOf = (sectionName: string) => sectionName.split(" - ")[1]?.trim() || "(source root)";

export async function versionFamilies() {
  const fws = await prisma.framework.findMany({ select: { id: true, name: true, family: true, versionLabel: true, _count: { select: { citations: true } } } });
  const fam = new Map<string, { id: string; short: string; version: string | null; citations: number }[]>();
  for (const f of fws) {
    if (!f.family) continue;
    fam.set(f.family, [...(fam.get(f.family) ?? []), { id: f.id, short: shortName(f.name), version: f.versionLabel, citations: f._count.citations }]);
  }
  return [...fam.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([family, versions]) => ({ family, versions: versions.sort((a, b) => (a.version ?? "").localeCompare(b.version ?? "", undefined, { numeric: true })) }));
}

interface Cit { id: string; sid: string; name: string }

export async function compareVersions(fromId: string, toId: string) {
  const [from, to] = await Promise.all([
    prisma.framework.findUnique({ where: { id: fromId } }),
    prisma.framework.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to) return null;

  const rows = await prisma.$queryRaw<
    { rid: string; requirementId: string; name: string | null; riskTopic: string | null; old: Cit[] | null; new: Cit[] | null; controls: { id: string; name: string; type: string }[] | null }[]
  >`
    WITH o AS (
      SELECT rc."requirementId" AS rid, json_agg(json_build_object('id', c.id, 'sid', c."sourceSectionId", 'name', c."sectionName") ORDER BY c."sectionName") AS cits
      FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id WHERE c."frameworkId" = ${fromId} GROUP BY 1
    ), n AS (
      SELECT rc."requirementId" AS rid, json_agg(json_build_object('id', c.id, 'sid', c."sourceSectionId", 'name', c."sectionName") ORDER BY c."sectionName") AS cits
      FROM "Citation" c JOIN "RequirementCitation" rc ON rc."citationId" = c.id WHERE c."frameworkId" = ${toId} GROUP BY 1
    ), k AS (
      SELECT m."requirementId" AS rid, json_agg(json_build_object('id', x.id, 'name', x."controlName", 'type', m."mappingType") ORDER BY x."controlName") AS controls
      FROM "ControlRequirementMapping" m JOIN "CcfControl" x ON x.id = m."controlId"
      WHERE m.authoritative AND m."requirementId" IS NOT NULL GROUP BY 1
    )
    SELECT r.id AS rid, r."requirementId", r.name, r."riskTopic", o.cits AS old, n.cits AS new, k.controls
    FROM "IntegratedRequirement" r
    LEFT JOIN o ON o.rid = r.id LEFT JOIN n ON n.rid = r.id LEFT JOIN k ON k.rid = r.id
    WHERE o.rid IS NOT NULL OR n.rid IS NOT NULL
    ORDER BY length(r."requirementId"), r."requirementId"`;

  const requirements = rows.map((r) => {
    const oldC = r.old ?? [];
    const newC = r.new ?? [];
    const oldF = [...new Set(oldC.map((c) => functionOf(c.name)))];
    const newF = [...new Set(newC.map((c) => functionOf(c.name)))];
    const status = oldC.length && newC.length ? "BOTH" : oldC.length ? "ONLY_OLD" : "ONLY_NEW";
    const functionChanged = status === "BOTH" && (oldF.some((f) => !newF.some((g) => sameFunction(f, g))) || newF.some((g) => !oldF.some((f) => sameFunction(f, g))));
    return {
      id: r.rid, requirementId: r.requirementId, name: r.name, riskTopic: r.riskTopic,
      oldCitations: oldC, newCitations: newC, oldFunctions: oldF, newFunctions: newF,
      status, functionChanged, controls: r.controls ?? [],
    };
  });

  // Function/domain flow: previous function → new function, counted by IR.
  const flows = new Map<string, number>();
  for (const r of requirements.filter((x) => x.status === "BOTH"))
    for (const a of r.oldFunctions) for (const b of r.newFunctions) flows.set(`${a}→${b}`, (flows.get(`${a}→${b}`) ?? 0) + 1);

  // Direct per-control references in version-specific columns.
  const cols = from.family && to.family === from.family ? VERSIONED_REFERENCE_COLUMNS[from.family] : undefined;
  const oldCol = cols?.[from.versionLabel ?? ""];
  const newCol = cols?.[to.versionLabel ?? ""];
  let controlRefs: ReturnType<typeof diffTokens>[] = [];
  if (oldCol && newCol) {
    const refs = await prisma.controlFrameworkReference.findMany({
      where: { columnName: { in: [oldCol, newCol] } },
      include: { control: { select: { id: true, controlName: true, title: true } } },
    });
    const byControl = new Map<string, { control: { id: string; controlName: string; title: string | null }; old?: typeof refs[number]; new?: typeof refs[number] }>();
    for (const r of refs) {
      const e = byControl.get(r.controlId) ?? { control: r.control };
      if (r.columnName === oldCol) e.old = r;
      else e.new = r;
      byControl.set(r.controlId, e);
    }
    controlRefs = [...byControl.values()].map((e) => diffTokens(e.control, e.old?.tokens ?? [], e.new?.tokens ?? [], e.old?.referenceRaw ?? null, e.new?.referenceRaw ?? null))
      .sort((a, b) => a.control.controlName.localeCompare(b.control.controlName, undefined, { numeric: true }));
  }

  const impacted = new Map<string, { id: string; name: string; reasons: Set<string> }>();
  for (const r of requirements) {
    const reason = r.status === "ONLY_OLD" ? `IR ${r.requirementId} is no longer cited by ${shortName(to.name)}` : r.status === "ONLY_NEW" ? `IR ${r.requirementId} is newly cited by ${shortName(to.name)}` : r.functionChanged ? `IR ${r.requirementId} citations move to ${r.newFunctions.join(", ")}` : null;
    if (!reason) continue;
    for (const c of r.controls) {
      const e = impacted.get(c.id) ?? { id: c.id, name: c.name, reasons: new Set<string>() };
      e.reasons.add(reason);
      impacted.set(c.id, e);
    }
  }
  for (const c of controlRefs.filter((x) => x.added.length || x.removed.length)) {
    const e = impacted.get(c.control.id) ?? { id: c.control.id, name: c.control.controlName, reasons: new Set<string>() };
    e.reasons.add(`Direct ${shortName(to.name)} references differ from ${shortName(from.name)} references`);
    impacted.set(c.control.id, e);
  }

  return {
    from: { id: from.id, name: from.name, short: shortName(from.name), version: from.versionLabel, citations: await prisma.citation.count({ where: { frameworkId: from.id } }) },
    to: { id: to.id, name: to.name, short: shortName(to.name), version: to.versionLabel, citations: await prisma.citation.count({ where: { frameworkId: to.id } }) },
    summary: {
      both: requirements.filter((r) => r.status === "BOTH").length,
      onlyOld: requirements.filter((r) => r.status === "ONLY_OLD").length,
      onlyNew: requirements.filter((r) => r.status === "ONLY_NEW").length,
      functionChanged: requirements.filter((r) => r.functionChanged).length,
      controlsWithRefs: controlRefs.length,
      refsUnchanged: controlRefs.filter((c) => !c.added.length && !c.removed.length).length,
      refsChanged: controlRefs.filter((c) => c.added.length || c.removed.length).length,
      impactedControls: impacted.size,
    },
    requirements,
    flows: [...flows.entries()].map(([k, n]) => ({ from: k.split("→")[0], to: k.split("→")[1], count: n })).sort((a, b) => b.count - a.count),
    referenceColumns: oldCol && newCol ? { old: oldCol, new: newCol } : null,
    controlRefs,
    impactedControls: [...impacted.values()].map((e) => ({ id: e.id, name: e.name, reasons: [...e.reasons] })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  };
}

/** Compare function labels ignoring the version prefix, e.g. "Identify (ID)" in both versions. */
function sameFunction(a: string, b: string) {
  return a.replace(/\s+/g, " ").toLowerCase() === b.replace(/\s+/g, " ").toLowerCase();
}

/** "ID.AM-1" and "ID.AM-01" differ only by zero padding. */
const normaliseId = (t: string) => t.replace(/\s+/g, "").replace(/-0*(\d+)/g, "-$1").toUpperCase();

function diffTokens(control: { id: string; controlName: string; title: string | null }, oldIn: string[], newIn: string[], oldRaw: string | null, newRaw: string | null) {
  const oldT = [...new Set(oldIn)], newT = [...new Set(newIn)];
  const oldSet = new Set(oldT), newSet = new Set(newT);
  const unchanged = oldT.filter((t) => newSet.has(t));
  const removed = oldT.filter((t) => !newSet.has(t));
  const added = newT.filter((t) => !oldSet.has(t));
  const reformatted = removed.filter((t) => added.some((a) => normaliseId(a) === normaliseId(t))).map((t) => ({ from: t, to: added.find((a) => normaliseId(a) === normaliseId(t))! }));
  return {
    control,
    oldRaw, newRaw,
    unchanged,
    removed: removed.filter((t) => !reformatted.some((r) => r.from === t)),
    added: added.filter((t) => !reformatted.some((r) => r.to === t)),
    reformatted,
  };
}

/** Transition rows, with the scenario classified from data where possible. */
export async function listTransitions() {
  const rows = await prisma.versionTransition.findMany({ orderBy: [{ createdAt: "desc" }, { sourceRow: "asc" }] });
  if (!rows.length) return [];
  const sectionIds = [...new Set(rows.flatMap((r) => [r.oldSectionId, r.newSectionId]).filter(Boolean) as string[])];
  const cits = await prisma.citation.findMany({
    where: { sourceSectionId: { in: sectionIds } },
    select: { sourceSectionId: true, sectionName: true, requirements: { select: { requirement: { select: { requirementId: true } } } } },
  });
  const reqBySection = new Map(cits.map((c) => [c.sourceSectionId, c.requirements.map((r) => r.requirement.requirementId)]));
  const controlNames = [...new Set(rows.map((r) => r.controlName).filter(Boolean) as string[])];
  const controls = await prisma.ccfControl.findMany({ where: { controlName: { in: controlNames } }, select: { id: true, controlName: true } });

  return rows.map((r) => {
    const oldReqs = r.oldSectionId ? reqBySection.get(r.oldSectionId) : undefined;
    const newReqs = r.newSectionId ? reqBySection.get(r.newSectionId) : undefined;
    let scenario: { code: "1" | "2" | "UNKNOWN"; basis: string };
    if (r.scenario) {
      scenario = { code: /2|chang/i.test(r.scenario) ? "2" : /1|unchang|same/i.test(r.scenario) ? "1" : "UNKNOWN", basis: `Stated in workbook: “${r.scenario}”` };
    } else if (oldReqs && newReqs) {
      const same = oldReqs.some((x) => newReqs.includes(x));
      scenario = same
        ? { code: "1", basis: `Old and new sections both map to IR ${oldReqs.filter((x) => newReqs.includes(x)).join(", ")} in the CCF workbook` }
        : { code: "2", basis: `Old section maps to IR ${oldReqs.join(", ")}; new section maps to IR ${newReqs.join(", ")}` };
    } else {
      const missing = [!oldReqs && "old", !newReqs && "new"].filter(Boolean).join(" and ");
      scenario = { code: "UNKNOWN", basis: `The ${missing} source section ID is not in the CCF workbook, and no scenario column is present` };
    }
    return { ...r, control: controls.find((c) => c.controlName === r.controlName) ?? null, oldRequirements: oldReqs ?? [], newRequirements: newReqs ?? [], scenarioResolved: scenario };
  });
}
