// Client impact of an approved framework version. Proposals are generated from the version relations and the
// client's existing mappings only; live mappings change only when a reviewer approves a proposal. Nothing here
// invents mappings: an affected control is one already mapped to a section that changed.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { DEFAULT_CLIENT } from "@/lib/ingest/persist";
import { deriveVersion, shortName } from "@/lib/frameworks";
import { parseHeading } from "@/lib/sources/headings";
import { idKey, type Relation, type RelationKind } from "@/lib/sources/relations";

interface Snapshot { texts: Record<string, string>; domains: Record<string, string> }
interface Analysis {
  base?: { id: string; short: string; version?: string | null }; counts?: Record<RelationKind, number>; relations?: Relation[];
  /** Previous version's text and domains at the time of the comparison (absent on older analyses). */
  previous?: Snapshot; current?: { domains: Record<string, string> };
}

/** Library row identifier: hierarchical names, or "NIST SP 800-53 r5.1.1: AC-02(01)-TITLE". */
const identifierOf = (name: string) => parseHeading(name).identifier;

/** Creates mapping proposals for in-scope controls mapped to the previous version (idempotent per version update). */
export async function generateProposals(ingestionId: string, actor: string) {
  const ing = await prisma.aiIngestion.findUniqueOrThrow({ where: { id: ingestionId }, select: { matchFrameworkId: true, publishedFrameworkId: true, analysis: true } });
  const a = (ing.analysis ?? {}) as Analysis;
  if (!ing.matchFrameworkId || !ing.publishedFrameworkId || ing.matchFrameworkId === ing.publishedFrameworkId || !a.relations) return { created: 0 };
  if (await prisma.mappingProposal.count({ where: { ingestionId } })) return { created: 0 };

  const [oldRows, newRows] = await Promise.all([
    prisma.citation.findMany({ where: { frameworkId: ing.matchFrameworkId }, select: { id: true, sectionName: true, controls: { select: { controlId: true, control: { select: { clientId: true, inScope: true } } } } } }),
    prisma.citation.findMany({ where: { frameworkId: ing.publishedFrameworkId }, select: { id: true, sectionName: true } }),
  ]);
  const newByKey = new Map(newRows.map((c) => [idKey(identifierOf(c.sectionName) ?? c.id), c.id]));
  const relByOld = new Map<string, Relation>();
  for (const r of a.relations) for (const f of r.from) relByOld.set(idKey(f), r);
  const fallback = (await prisma.client.upsert({ where: { name: DEFAULT_CLIENT }, create: { name: DEFAULT_CLIENT }, update: {} })).id;

  const data: { clientId: string; controlId: string; action: string; citationId: string; reason: string; changeType: string; confidence: number; ingestionId: string; createdBy: string }[] = [];
  for (const old of oldRows) {
    if (!old.controls.length) continue;
    const id = identifierOf(old.sectionName);
    const rel = id ? relByOld.get(idKey(id)) : undefined;
    if (!rel) continue;
    for (const m of old.controls) {
      if (!m.control.inScope) continue; // controls the client has taken out of scope get no suggestions
      const base = { clientId: m.control.clientId ?? fallback, controlId: m.controlId, changeType: rel.kind, confidence: rel.confidence, ingestionId, createdBy: actor };
      if (rel.kind === "REMOVED") data.push({ ...base, action: "FLAG_REMOVED", citationId: old.id, reason: `${id} no longer exists in the new version. ${rel.explanation} Review whether this control still needs a requirement in the new version.` });
      else for (const t of rel.to) {
        const target = newByKey.get(idKey(t));
        if (target) data.push({ ...base, action: "ADD", citationId: target, reason: `Mapped to ${id} in the previous version. ${rel.explanation}` });
      }
    }
  }
  if (data.length) await prisma.mappingProposal.createMany({ data });
  await prisma.auditLog.create({ data: { actor, action: "MAPPING_PROPOSALS_GENERATED", entity: "AiIngestion", entityId: ingestionId, details: { proposals: data.length } } });
  return { created: data.length };
}

/** Undo a publication that nobody has built on yet: removes the new version and its pending proposals. */
export async function revertPublication(ingestionId: string, actor: string) {
  const ing = await prisma.aiIngestion.findUnique({ where: { id: ingestionId }, select: { status: true, publishedFrameworkId: true, matchFrameworkId: true, detected: true } });
  if (!ing || ing.status !== "PUBLISHED" || !ing.publishedFrameworkId) throw new HttpError(409, "Only a published version can be reverted.");
  // A comparison of two versions already in the library installed nothing, so there is nothing to revert.
  if ((ing.detected as { source?: string } | null)?.source === "LIBRARY_COMPARISON") throw new HttpError(409, "This is a comparison of two versions already in the library; there is no publication to revert.");
  if (ing.publishedFrameworkId === ing.matchFrameworkId) throw new HttpError(409, "This publication updated an existing document in place and cannot be reverted automatically.");
  if (await prisma.mappingProposal.count({ where: { ingestionId, status: "APPROVED" } })) throw new HttpError(409, "Approved mapping changes depend on this version. Reject or reverse them first.");
  const linked = await prisma.controlObligation.count({ where: { citation: { frameworkId: ing.publishedFrameworkId } } });
  if (linked) throw new HttpError(409, `${linked} client mapping(s) use this version; it cannot be reverted.`);
  await prisma.$transaction([
    prisma.mappingProposal.deleteMany({ where: { ingestionId } }),
    prisma.framework.delete({ where: { id: ing.publishedFrameworkId } }),
    prisma.aiIngestion.update({ where: { id: ingestionId }, data: { status: "REVERTED", publishedFrameworkId: null } }),
    prisma.auditLog.create({ data: { actor, action: "VERSION_REVERTED", entity: "AiIngestion", entityId: ingestionId, details: { frameworkId: ing.publishedFrameworkId } } }),
  ]);
}

/** Version updates that have been approved and published, newest first. */
export async function listVersionUpdates() {
  const rows = await prisma.aiIngestion.findMany({ where: { status: "PUBLISHED", publishedFrameworkId: { not: null } }, orderBy: { reviewedAt: "desc" }, select: { id: true, matchFrameworkId: true, publishedFrameworkId: true, reviewedBy: true, reviewedAt: true, updatedAt: true, analysis: true } });
  const fws = await prisma.framework.findMany({ where: { id: { in: rows.flatMap((r) => [r.matchFrameworkId, r.publishedFrameworkId]).filter((x): x is string => !!x) } }, select: { id: true, name: true, family: true, versionLabel: true } });
  const fw = new Map(fws.map((f) => [f.id, f]));
  const pending = await prisma.mappingProposal.groupBy({ by: ["ingestionId"], where: { status: "PENDING", ingestionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
  return rows.map((r) => {
    const prev = r.matchFrameworkId ? fw.get(r.matchFrameworkId) : null, next = r.publishedFrameworkId ? fw.get(r.publishedFrameworkId) : null;
    // A previous version later removed from the library is still named from the comparison record.
    const base = ((r.analysis ?? {}) as Analysis).base;
    return {
      id: r.id, family: next?.family ?? prev?.family ?? null,
      previous: prev ? { id: prev.id, short: shortName(prev.name), version: prev.versionLabel, removed: false }
        : base ? { id: base.id, short: base.short, version: base.version ?? deriveVersion(base.short), removed: true } : null,
      current: next ? { id: next.id, short: shortName(next.name), version: next.versionLabel } : null,
      approvedBy: r.reviewedBy, approvedAt: (r.reviewedAt ?? r.updatedAt).toISOString(),
      counts: ((r.analysis ?? {}) as Analysis).counts ?? null,
      pendingProposals: pending.find((p) => p.ingestionId === r.id)?._count._all ?? 0,
    };
  });
}

/** Everything Change Analytics shows for one approved version update. */
export async function versionUpdateDetail(ingestionId: string) {
  const list = await listVersionUpdates();
  const u = list.find((x) => x.id === ingestionId);
  if (!u) throw new HttpError(404, "Version update not found.");
  const ing = await prisma.aiIngestion.findUniqueOrThrow({ where: { id: ingestionId }, select: { analysis: true, summary: true, sections: { select: { identifier: true, title: true, text: true } } } });
  const a = (ing.analysis ?? {}) as Analysis;
  // New text: from the uploaded draft, or (for two versions already in the library) from the current version.
  const newRows = ing.sections.length || !u.current ? [] : await prisma.citation.findMany({ where: { frameworkId: u.current.id }, select: { sectionName: true, sectionText: true } });
  const newText = new Map(ing.sections.length
    ? ing.sections.map((s) => [idKey(s.identifier), { title: s.title, text: s.text.slice(0, 600) }])
    : newRows.map((c) => [idKey(identifierOf(c.sectionName) ?? ""), { title: "", text: (c.sectionText ?? "").split("\n\n").slice(1).join("\n").split(/\n\s*Discussion:/)[0].slice(0, 600) }]));
  const oldRows = u.previous && !u.previous.removed ? await prisma.citation.findMany({ where: { frameworkId: u.previous.id }, select: { id: true, sourceSectionId: true, sectionName: true, sectionText: true, controls: { select: { control: { select: { id: true, controlName: true, title: true } } } } } }) : [];
  // Previous text: from the library while that version is there, otherwise from the snapshot kept with the comparison.
  const oldText = oldRows.length
    ? new Map(oldRows.map((c) => [idKey(identifierOf(c.sectionName) ?? ""), (c.sectionText ?? "").split("\n\n").slice(1).join("\n").split(/\n\s*Discussion:/)[0].slice(0, 600)]))
    : new Map(Object.entries(a.previous?.texts ?? {}));

  // Domain of a section, for the analytics matrix: its first heading level (e.g. "Chapter III High-Risk AI
  // Systems"), else the identifier family ("DSP" in "DSP-02"), else "Other".
  const domains = new Map<string, string>([...Object.entries(a.previous?.domains ?? {}), ...Object.entries(a.current?.domains ?? {})]);
  for (const c of oldRows) { const d = c.sectionName.split(" - ")[1], id = identifierOf(c.sectionName); if (d && id && d !== id && !domains.has(idKey(id))) domains.set(idKey(id), d); }
  const domainOf = (id: string) => domains.get(idKey(id)) ?? (/^Annex\b/i.test(id) ? "Annexes" : id.match(/^([A-Z]{2,3})[-.]/)?.[1] ?? "Other");
  const counted: Record<string, Record<RelationKind, number>> = {};
  for (const r of a.relations ?? []) {
    const d = domainOf(r.to[0] ?? r.from[0] ?? "Other");
    counted[d] ??= { UNCHANGED: 0, MODIFIED: 0, RENUMBERED: 0, SPLIT: 0, COMBINED: 0, ADDED: 0, REMOVED: 0 };
    counted[d][r.kind]++;
  }
  // Domains in document order: numbered parts ("Chapter IX …", "Title 2 …") by their number, annexes after them,
  // anything else in the order it first appears.
  const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  const num = (d: string) => {
    if (d === "Annexes") return 1e6;
    if (d === "Other") return 1e7;
    const m = d.match(/^(?:Chapter|Title|Part|Section|Book)\s+([IVXLC]+|\d+)\b/i);
    if (!m) return null;
    return /^\d+$/.test(m[1]) ? Number(m[1]) : [...m[1].toUpperCase()].reduce((n, c, i, s) => (ROMAN[c] < (ROMAN[s[i + 1]] ?? 0) ? n - ROMAN[c] : n + ROMAN[c]), 0);
  };
  const seen = [...new Set([...Object.values(a.current?.domains ?? {}), ...Object.values(a.previous?.domains ?? {}), ...Object.keys(counted)])].filter((d) => counted[d]);
  const order = seen.map((d, i) => ({ d, k: num(d) ?? i })).sort((x, y) => x.k - y.k).map((x) => x.d);
  const matrix = Object.fromEntries(order.map((d) => [d, counted[d]]));

  const proposals = await prisma.mappingProposal.findMany({
    where: { ingestionId }, orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: { id: true, action: true, status: true, reason: true, changeType: true, confidence: true, reviewedBy: true, reviewedAt: true, reviewNote: true, control: { select: { id: true, controlName: true, title: true } }, citation: { select: { id: true, sourceSectionId: true, sectionName: true } } },
  });
  const mappedControls = new Map<string, { id: string; controlName: string; title: string | null }>();
  oldRows.forEach((c) => c.controls.forEach((m) => mappedControls.set(m.control.id, m.control)));
  const affected = new Set(proposals.map((p) => p.control.id));
  // New requirements that no approved or proposed mapping covers yet.
  const covered = new Set(proposals.filter((p) => p.action === "ADD").map((p) => idKey(identifierOf(p.citation.sectionName) ?? "")));
  const newlyUnmapped = (a.relations ?? []).filter((r) => r.kind === "ADDED").flatMap((r) => r.to).filter((t) => !covered.has(idKey(t)));

  // Per affected control: what it was mapped to before, what is now proposed (or approved), and why. Test procedures
  // are deliberately absent: they do not change with a framework version, only their framework mapping does.
  const prevByControl = new Map<string, { id: string; section: string; name: string }[]>();
  for (const c of oldRows) for (const m of c.controls) {
    const l = prevByControl.get(m.control.id) ?? [];
    l.push({ id: c.id, section: identifierOf(c.sectionName) ?? c.sourceSectionId, name: c.sectionName });
    prevByControl.set(m.control.id, l);
  }
  const relOf = new Map<string, Relation>();
  for (const r of a.relations ?? []) for (const f of r.from) relOf.set(idKey(f), r);
  const controlImpacts = [...affected].map((cid) => {
    const control = mappedControls.get(cid) ?? proposals.find((p) => p.control.id === cid)!.control;
    const mine = proposals.filter((p) => p.control.id === cid);
    const previous = prevByControl.get(cid) ?? [];
    const seen = new Set<string>();
    const relationships = previous.flatMap((pv) => {
      const r = relOf.get(idKey(pv.section));
      if (!r || r.kind === "UNCHANGED") return [];
      const key = `${r.kind}|${r.from.join()}|${r.to.join()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ kind: r.kind, from: r.from, to: r.to, confidence: r.confidence, explanation: r.explanation }];
    });
    return {
      control,
      previous: previous.map((x) => ({ section: x.section, name: x.name })),
      updated: mine.filter((p) => p.action === "ADD").map((p) => ({ id: p.id, section: identifierOf(p.citation.sectionName) ?? p.citation.sourceSectionId, name: p.citation.sectionName, status: p.status })),
      retired: mine.filter((p) => p.action === "FLAG_REMOVED").map((p) => ({ id: p.id, section: identifierOf(p.citation.sectionName) ?? p.citation.sourceSectionId, status: p.status })),
      relationships,
      pending: mine.filter((p) => p.status === "PENDING").length,
    };
  }).sort((x, y) => x.control.controlName.localeCompare(y.control.controlName, undefined, { numeric: true }));
  const totalControls = await prisma.ccfControl.count();

  return {
    ...u, summary: ing.summary, totalControls, controlImpacts,
    relations: (a.relations ?? []).filter((r) => r.kind !== "UNCHANGED").map((r) => ({
      ...r,
      before: r.from.map((f) => ({ id: f, text: oldText.get(idKey(f)) ?? null })),
      after: r.to.map((t) => ({ id: t, ...(newText.get(idKey(t)) ?? { title: "", text: "" }) })),
    })),
    matrix,
    proposals: proposals.map((p) => ({ ...p, reviewedAt: p.reviewedAt?.toISOString() ?? null, section: identifierOf(p.citation.sectionName) ?? p.citation.sourceSectionId })),
    affectedControls: [...affected].map((id) => mappedControls.get(id) ?? proposals.find((p) => p.control.id === id)!.control),
    unaffectedControls: [...mappedControls.values()].filter((c) => !affected.has(c.id)),
    newlyUnmapped,
  };
}

/** Controls with unreviewed mapping suggestions from an approved version update, with the update they stem from. */
export async function controlsNeedingReview(controlIds?: string[]) {
  const rows = await prisma.mappingProposal.findMany({
    where: { status: "PENDING", ingestionId: { not: null }, ...(controlIds && { controlId: { in: controlIds } }) },
    select: { controlId: true, ingestionId: true, changeType: true },
  });
  const ings = await prisma.aiIngestion.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ingestionId!))] } }, select: { id: true, matchFrameworkId: true, publishedFrameworkId: true } });
  const fws = new Map((await prisma.framework.findMany({ where: { id: { in: ings.flatMap((i) => [i.matchFrameworkId, i.publishedFrameworkId]).filter((x): x is string => !!x) } }, select: { id: true, name: true, versionLabel: true } })).map((f) => [f.id, f]));
  const label = new Map(ings.map((i) => {
    const prev = i.matchFrameworkId ? fws.get(i.matchFrameworkId) : undefined, next = i.publishedFrameworkId ? fws.get(i.publishedFrameworkId) : undefined;
    return [i.id, `${shortName(next?.name ?? prev?.name ?? "Framework")} ${prev?.versionLabel ?? "?"} → ${next?.versionLabel ?? "?"}`] as const;
  }));
  const out = new Map<string, { updateId: string; label: string; count: number }>();
  for (const r of rows) {
    const e = out.get(r.controlId);
    if (e) e.count++; else out.set(r.controlId, { updateId: r.ingestionId!, label: label.get(r.ingestionId!) ?? "New framework version", count: 1 });
  }
  return out;
}
