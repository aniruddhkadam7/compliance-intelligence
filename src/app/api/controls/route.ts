import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { ControlFilters, controlFacets, listControls, setControlScope } from "@/lib/queries/controls";
import { searchParamsToObject } from "@/lib/queries/params";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const sp = new URL(req.url).searchParams;
  if (sp.get("view") === "facets") return NextResponse.json(await controlFacets());
  return NextResponse.json(await listControls(ControlFilters.parse(searchParamsToObject(sp))));
});

const ScopeChange = z.union([
  z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(1000), inScope: z.boolean() }),
  z.object({ preset: z.enum(["all", "selection"]) }),
]);

/** Changes the client's control scope (which controls count in coverage, gaps and update flags). */
export const PATCH = handle(async (req: Request) => {
  const session = await requireWriter();
  const change = ScopeChange.parse(await req.json());
  const updated = await setControlScope(change);
  await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: "CONTROL_SCOPE_CHANGED", entity: "CcfControl", entityId: "scope", details: { ...change, updated } } });
  return NextResponse.json({ updated });
});
