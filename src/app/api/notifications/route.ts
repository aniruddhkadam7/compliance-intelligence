import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { listNotifications, markRead, readIds } from "@/lib/queries/notifications";

/** Everything in the notification panel (updates offered, connector findings, connector errors), with this user's read state. */
export const GET = handle(async () => {
  const session = await requireSession();
  const reviewer = session.role === "admin" || session.role === "analyst";
  const [items, read] = await Promise.all([listNotifications({ reviewer }), readIds(session.sub)]);
  const withRead = items.map((n) => ({ ...n, read: read.has(n.id) }));
  return NextResponse.json({ items: withRead, total: items.length, unread: withRead.filter((n) => !n.read).length });
});

const Body = z.object({ ids: z.union([z.array(z.string().min(1).max(200)).min(1).max(200), z.literal("all")]) });

/** Marks notifications read for the signed-in user: a list of ids, or "all". Changes nothing else. */
export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const { ids } = Body.parse(await req.json());
  await markRead(session.sub, ids, { reviewer: session.role === "admin" || session.role === "analyst" });
  return NextResponse.json({ ok: true });
});
