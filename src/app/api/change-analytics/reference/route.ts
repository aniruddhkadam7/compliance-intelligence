import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { DEMO_KEYS, getDemoState, statusOf, type DemoKey } from "@/lib/demo/state";
import { listReferenceImpact, referenceImpactDetail } from "@/lib/updates/reference-impact";

export const runtime = "nodejs";

/**
 * Framework update impact on the client's controls: the list, or one update in full with ?key=. Each update carries
 * its demo status (offered, applied or rejected in Sources) and the controls approved so far.
 */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const key = z.string().max(40).optional().parse(new URL(req.url).searchParams.get("key") ?? undefined);
  const [state, controlsUploaded] = await Promise.all([getDemoState(), prisma.ccfControl.count()]);
  const flow = (k: DemoKey) => ({ status: statusOf(state, k), uploadedAfter: !!state.uploadedAfter[k], approved: state.approved[k] ?? [], rejected: state.rejected?.[k] ?? [] });
  const offered = (k: string): k is DemoKey => (DEMO_KEYS as string[]).includes(k);
  if (!key) {
    const updates = (await listReferenceImpact()).filter((u) => offered(u.key)).map((u) => ({ ...u, ...flow(u.key as DemoKey) }))
      .sort((a, b) => DEMO_KEYS.indexOf(a.key as DemoKey) - DEMO_KEYS.indexOf(b.key as DemoKey));
    return NextResponse.json({ controlsUploaded, updates });
  }
  const detail = offered(key) ? await referenceImpactDetail(key) : null;
  if (!detail) throw new HttpError(404, "Framework update not found.");
  return NextResponse.json({ ...detail, ...flow(key as DemoKey) });
});
