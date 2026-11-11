import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { listNotifications } from "@/lib/queries/notifications";

/** Everything in the notification panel: updates offered in Sources, connector findings to review, connector errors. */
export const GET = handle(async () => {
  await requireSession();
  const items = await listNotifications();
  return NextResponse.json({ items, total: items.length });
});
