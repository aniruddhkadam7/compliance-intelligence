// Source relationships (global) and their impact on client mappings. Everything here is driven by
// supplied relationship files; nothing is inferred.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { DEFAULT_CLIENT } from "@/lib/ingest/persist";
import { ListParams, paging } from "./params";

const citationSelect = { id: true, sourceSectionId: true, sectionName: true, framework: { select: { id: true, name: true } } } as const;
type Cit = Prisma.CitationGetPayload<{ select: typeof citationSelect }>;
const cit = (c: Cit | null) => (c ? { id: c.id, sourceSectionId: c.sourceSectionId, sectionName: c.sectionName, framework: { id: c.framework.id, short: shortName(c.framework.name) } } : null);

/** Framework pairs that have relationships of the given kind (from-document -> to-document). */
export async function relationshipPairs(kind: "VERSION_TRANSITION" | "CROSS_FRAMEWORK") {
  const rows = await prisma.$queryRaw<{ from_fw: string | null; to_fw: string | null; n: bigint }[]>`
    SELECT cf."frameworkId" AS from_fw, ct."frameworkId" AS to_fw, COUNT(*) AS n
    FROM "SourceRelationship" r
    LEFT JOIN "Citation" cf ON cf.id = r."fromCitationId"
    LEFT JOIN "Citation" ct ON ct.id = r."toCitationId"
    WHERE r.kind = ${kind}
    GROUP BY 1, 2`;
  // Added/removed rows have one side empty; fold them into the pair that shares the other side.
  const pairs = new Map<string, { from: string; to: string; count: number }>();
  for (const r of rows.filter((x) => x.from_fw && x.to_fw)) pairs.set(`${r.from_fw}|${r.to_fw}`, { from: r.from_fw!, to: r.to_fw!, count: Number(r.n) });
  for (const r of rows.filter((x) => !x.from_fw || !x.to_fw)) {
    const p = [...pairs.values()].find((x) => x.from === r.from_fw || x.to === r.to_fw);
    if (p) p.count += Number(r.n);
  }
  const fws = await prisma.framework.findMany({ where: { id: { in: [...pairs.values()].flatMap((p) => [p.from, p.to]) } }, select: { id: true, name: true } });
  const nm = new Map(fws.map((f) => [f.id, shortName(f.name)]));
  return [...pairs.values()].map((p) => ({ ...p, fromShort: nm.get(p.from) ?? "?", toShort: nm.get(p.to) ?? "?" }));
}

export const RelationshipFilters = ListParams.extend({
  kind: z.enum(["VERSION_TRANSITION", "CROSS_FRAMEWORK"]),
  from: z.string().max(40).optional().default(""),
  to: z.string().max(40).optional().default(""),
  status: z.string().max(30).optional().default(""),
});

/** Relationship rows for one document pair (both sides optional for added/removed sections). */
export async function listRelationships(f: z.infer<typeof RelationshipFilters>) {
  const pairWhere: Prisma.SourceRelationshipWhereInput = f.from && f.to
    ? {
        OR: [
          { fromCitation: { frameworkId: f.from }, toCitation: { frameworkId: f.to } },
          { fromCitation: { frameworkId: f.from }, toCitationId: null },
          { fromCitationId: null, toCitation: { frameworkId: f.to } },
        ],
      }
    : {};
  const where: Prisma.SourceRelationshipWhereInput = {
    kind: f.kind,
    AND: [
      pairWhere,
      f.status ? { status: f.status } : {},
      f.q
        ? {
            OR: [
              { fromSourceId: f.q }, { toSourceId: f.q },
              { fromCitation: { sectionName: { contains: f.q, mode: "insensitive" } } },
              { toCitation: { sectionName: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [items, total, byStatus] = await Promise.all([
    prisma.sourceRelationship.findMany({
      where, ...paging(f), orderBy: [{ fromSourceId: "asc" }, { toSourceId: "asc" }],
      include: { fromCitation: { select: citationSelect }, toCitation: { select: citationSelect } },
    }),
    prisma.sourceRelationship.count({ where }),
    prisma.sourceRelationship.groupBy({ by: ["status"], where: { kind: f.kind, AND: [pairWhere] }, _count: { _all: true } }),
  ]);
  return {
    items: items.map((r) => ({ id: r.id, status: r.status, note: r.note, fromSourceId: r.fromSourceId, toSourceId: r.toSourceId, from: cit(r.fromCitation), to: cit(r.toCitation) })),
    total, page: f.page, pageSize: f.pageSize,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  };
}

/** Custom controls mapped to legacy sections that change in the given transition pair. */
export async function clientImpact(from: string, to: string) {
  const client = await prisma.client.findUnique({ where: { name: DEFAULT_CLIENT } });
  const controlCount = await prisma.ccfControl.count();
  if (!client || controlCount === 0) return { hasClientData: false, controls: [], pending: [] };
  const rels = await prisma.sourceRelationship.findMany({
    where: { kind: "VERSION_TRANSITION", status: { not: "UNCHANGED" }, fromCitation: { frameworkId: from }, OR: [{ toCitation: { frameworkId: to } }, { toCitationId: null }] },
    include: {
      fromCitation: { select: { ...citationSelect, controls: { where: { control: { clientId: client.id } }, select: { control: { select: { id: true, controlName: true, title: true } } } } } },
      toCitation: { select: citationSelect },
    },
  });
  const byControl = new Map<string, { id: string; controlName: string; title: string | null; changes: { relationshipId: string; status: string; from: ReturnType<typeof cit>; to: ReturnType<typeof cit> }[] }>();
  for (const r of rels)
    for (const { control } of r.fromCitation?.controls ?? []) {
      const e = byControl.get(control.id) ?? { ...control, changes: [] };
      e.changes.push({ relationshipId: r.id, status: r.status, from: cit(r.fromCitation), to: cit(r.toCitation) });
      byControl.set(control.id, e);
    }
  const pending = await prisma.mappingProposal.findMany({
    where: { clientId: client.id, status: "PENDING" },
    include: { control: { select: { controlName: true } }, citation: { select: citationSelect } },
    orderBy: { createdAt: "asc" },
  });
  return {
    hasClientData: true,
    controls: [...byControl.values()].sort((a, b) => a.controlName.localeCompare(b.controlName, undefined, { numeric: true })),
    pending: pending.map((p) => ({ id: p.id, action: p.action, reason: p.reason, control: p.control.controlName, citation: cit(p.citation), createdBy: p.createdBy, createdAt: p.createdAt })),
  };
}

/**
 * Creates review proposals for every impacted control: map to each latest section that succeeds a mapped
 * legacy section; for retired sections, propose removing the legacy mapping. Nothing is applied here.
 */
export async function proposeFromTransitions(from: string, to: string, actor: string) {
  const impact = await clientImpact(from, to);
  const client = await prisma.client.findUnique({ where: { name: DEFAULT_CLIENT } });
  if (!client || !impact.hasClientData) return { created: 0 };
  const existing = await prisma.mappingProposal.findMany({ where: { clientId: client.id, status: "PENDING" }, select: { controlId: true, citationId: true, action: true } });
  const mapped = await prisma.controlObligation.findMany({ where: { controlId: { in: impact.controls.map((c) => c.id) } }, select: { controlId: true, citationId: true } });
  const has = (s: { controlId: string; citationId: string; action?: string }[], c: string, o: string, a?: string) => s.some((x) => x.controlId === c && x.citationId === o && (!a || x.action === a));
  const data: Prisma.MappingProposalCreateManyInput[] = [];
  for (const c of impact.controls)
    for (const ch of c.changes) {
      if (ch.to && !has(mapped, c.id, ch.to.id) && !has(existing, c.id, ch.to.id, "ADD") && !data.some((d) => d.controlId === c.id && d.citationId === ch.to!.id))
        data.push({ clientId: client.id, controlId: c.id, action: "ADD", citationId: ch.to.id, relationshipId: ch.relationshipId, createdBy: actor, reason: `${ch.from?.sourceSectionId} ${ch.status.toLowerCase()} → ${ch.to.sourceSectionId}` });
      if (!ch.to && ch.from && !has(existing, c.id, ch.from.id, "REMOVE"))
        data.push({ clientId: client.id, controlId: c.id, action: "REMOVE", citationId: ch.from.id, relationshipId: ch.relationshipId, createdBy: actor, reason: `${ch.from.sourceSectionId} retired in the latest version` });
    }
  if (data.length) await prisma.mappingProposal.createMany({ data });
  return { created: data.length };
}

/** Approve (apply) or reject a proposal. Approved changes update the client's current mapping. */
export async function reviewProposal(id: string, decision: "APPROVED" | "REJECTED", actor: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.mappingProposal.findUnique({ where: { id } });
    if (!p || p.status !== "PENDING") return null;
    if (decision === "APPROVED") {
      if (p.action === "ADD")
        await tx.controlObligation.upsert({
          where: { controlId_citationId: { controlId: p.controlId, citationId: p.citationId } },
          create: { controlId: p.controlId, citationId: p.citationId, mappingType: "APPROVED_UPDATE" },
          update: {},
        });
      else if (p.action === "REMOVE") await tx.controlObligation.deleteMany({ where: { controlId: p.controlId, citationId: p.citationId } });
      // FLAG_REMOVED is an acknowledgement: the mapping to the previous version is kept as history.
    }
    const updated = await tx.mappingProposal.update({ where: { id }, data: { status: decision, reviewedBy: actor, reviewedAt: new Date(), reviewNote: note ?? null } });
    await tx.auditLog.create({ data: { actor, action: decision === "APPROVED" ? "MAPPING_UPDATE_APPROVED" : "MAPPING_UPDATE_REJECTED", entity: "MappingProposal", entityId: id, details: { action: p.action, controlId: p.controlId, citationId: p.citationId } } });
    return updated;
  });
}

