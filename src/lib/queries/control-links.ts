// Links between custom controls and framework sections as the client sees them: each control shows only the framework
// version it currently points to (see src/lib/demo/versions.ts), so a framework's previous and new version are never both
// counted. Anything that counts or lists a framework's controls reads this instead of the raw links.
import { prisma } from "@/lib/db";
import { controlVersions } from "@/lib/demo/state";

export interface ControlLink { controlId: string; controlName: string; frameworkId: string; citationId: string; name: string; family: string | null }

/** Every control-to-section link that is visible for the version each control points to. */
export async function visibleLinks(versions?: Awaited<ReturnType<typeof controlVersions>>): Promise<ControlLink[]> {
  const v = versions ?? (await controlVersions());
  const rows = await prisma.$queryRaw<ControlLink[]>`
    SELECT DISTINCT o."controlId", k."controlName", c."frameworkId", c.id AS "citationId", f."name", f."family"
    FROM "ControlObligation" o
    JOIN "Citation" c ON c.id = o."citationId"
    JOIN "Framework" f ON f.id = c."frameworkId"
    JOIN "CcfControl" k ON k.id = o."controlId"`;
  const hidden = new Map<string, Set<string>>();
  return rows.filter((r) => {
    if (!hidden.has(r.controlName)) hidden.set(r.controlName, v.resolve(r.controlName).hidden);
    return !hidden.get(r.controlName)!.has(r.frameworkId);
  });
}

/** One entry per control and framework document (section detail dropped). */
export async function visibleControlFrameworks(versions?: Awaited<ReturnType<typeof controlVersions>>) {
  const seen = new Set<string>();
  return (await visibleLinks(versions)).filter((l) => {
    const key = `${l.controlId}:${l.frameworkId}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}
