// Framework update impact on the client's controls, from the team's "Change Analytics" workbook (built into the app as
// src/data/framework-update-impact.json by scripts/build-update-impact.ts).
//
// For each framework update (e.g. ISO/IEC 27002 2013 -> 2022) the workbook says, per client test procedure, which sections
// it maps to under the legacy and under the latest version. A test procedure whose two lists differ has changed; the
// control that owns it is affected. Nothing here is inferred, and nothing is written to the database: control titles are
// read from the client's controls when they are loaded.
import { prisma } from "@/lib/db";

interface ImpactData {
  source: string;
  version: string;
  totalTestProcedures: number;
  controls: Record<string, number>;
  docs: Record<string, string>;
  sections: Record<string, [string, string, string]>;
  tpText: Record<string, string>;
  updates: { key: string; family: string; previous: string; current: string; sheet: string; changed: [string, string, number[], number[]][] }[];
}

export interface ImpactSection { doc: string; identifier: string; title: string }
export interface ImpactSummary {
  key: string; family: string; previous: string; current: string;
  changedTestProcedures: number; totalTestProcedures: number; affectedControls: number; totalControls: number;
}

const load = async () => (await import("@/data/framework-update-impact.json")).default as unknown as ImpactData;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const familyOf = (control: string) => control.split("-")[0];

function summarise(data: ImpactData, u: ImpactData["updates"][number]): ImpactSummary {
  return {
    key: u.key, family: u.family, previous: u.previous, current: u.current,
    changedTestProcedures: u.changed.length, totalTestProcedures: data.totalTestProcedures,
    affectedControls: new Set(u.changed.map((c) => c[0])).size, totalControls: Object.keys(data.controls).length,
  };
}

/** The framework updates Change Analytics offers, with their headline numbers. */
export async function listReferenceImpact(): Promise<ImpactSummary[]> {
  const data = await load();
  return data.updates.map((u) => summarise(data, u));
}

/** One update in full: the affected controls, their changed test procedures, and what moved in each mapping. */
export async function referenceImpactDetail(key: string) {
  const data = await load();
  const u = data.updates.find((x) => x.key === key);
  if (!u) return null;
  const section = (id: number): ImpactSection => {
    const s = data.sections[String(id)];
    return s ? { doc: data.docs[s[0]] ?? "", identifier: s[1], title: s[2] } : { doc: "", identifier: String(id), title: "" };
  };
  const byControl = new Map<string, { id: string; text: string; removed: ImpactSection[]; added: ImpactSection[] }[]>();
  for (const [control, tp, removed, added] of u.changed) {
    const list = byControl.get(control) ?? [];
    list.push({ id: tp, text: data.tpText[tp] ?? "", removed: removed.map(section), added: added.map(section) });
    byControl.set(control, list);
  }
  const names = [...byControl.keys()].sort(natural);
  const titles = new Map((await prisma.ccfControl.findMany({ where: { controlName: { in: names } }, select: { controlName: true, title: true } })).map((c) => [c.controlName, c.title]));
  const controls = names.map((name) => ({
    controlName: name,
    title: titles.get(name) ?? null,
    totalTestProcedures: data.controls[name] ?? 0,
    changed: byControl.get(name)!.sort((x, y) => natural(x.id, y.id)),
  }));

  // Affected against all controls, by control family (the letters before the first dash: AM, CM, ...).
  const families = new Map<string, { affected: number; total: number }>();
  for (const name of Object.keys(data.controls)) {
    const f = familyOf(name), e = families.get(f) ?? { affected: 0, total: 0 };
    e.total++;
    if (byControl.has(name)) e.affected++;
    families.set(f, e);
  }
  const moved = (pick: 1 | 2) => new Set(u.changed.flatMap((c) => c[pick + 1] as number[])).size;
  return {
    ...summarise(data, u),
    removedSections: moved(1),
    addedSections: moved(2),
    controls,
    families: [...families].map(([family, v]) => ({ family, ...v })).sort((a, b) => natural(a.family, b.family)),
  };
}
export type ImpactDetail = NonNullable<Awaited<ReturnType<typeof referenceImpactDetail>>>;
