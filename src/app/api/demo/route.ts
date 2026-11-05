import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireSession, requireWriter } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { applyUpdates, approveControls, DEMO_KEYS, getDemoState, isReleased, rejectUpdates, releaseUpdates, rollback } from "@/lib/demo/state";

export const runtime = "nodejs";
export const maxDuration = 120;

const Key = z.enum(DEMO_KEYS);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), keys: z.array(Key).min(1) }),
  z.object({ action: z.literal("reject"), keys: z.array(Key).min(1) }),
  z.object({ action: z.literal("approve"), key: Key, controls: z.array(z.string().min(1).max(60)).min(1).max(500) }),
  z.object({ action: z.literal("rollback") }),
  z.object({ action: z.literal("release"), keys: z.array(Key).min(1), released: z.boolean() }),
]);

/** Demonstration flow state: framework updates applied or rejected, control mappings approved. */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await getDemoState());
});

/** Apply or reject framework updates (Sources), approve control mappings (Change Analytics), or roll back. */
export const POST = handle(async (req: Request) => {
  const session = await requireWriter();
  const body = Body.parse(await req.json());
  if (body.action === "release") {
    if (session.role !== "admin") throw new HttpError(403, "Only an admin can release updates to users.");
    await releaseUpdates(body.keys, body.released);
  }
  if (body.action === "update") {
    const state = await getDemoState();
    if (body.keys.some((k) => !isReleased(state, k))) throw new HttpError(409, "This update has not been released to users yet. Release it in the Admin Console first.");
    await applyUpdates(body.keys);
  }
  if (body.action === "reject") await rejectUpdates(body.keys);
  if (body.action === "approve") {
    try { await approveControls(body.key, body.controls); } catch (e) { throw new HttpError(409, e instanceof Error ? e.message : "Approval failed."); }
  }
  if (body.action === "rollback") await rollback(session.sub, session.role);
  else await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: `DEMO_${body.action.toUpperCase()}`, entity: "DemoState", details: body } });
  // Pages that show which framework version a control points to must not be served from the browser's page cache.
  revalidatePath("/", "layout");
  return NextResponse.json(await getDemoState());
});
