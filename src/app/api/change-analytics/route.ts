import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { listVersionUpdates } from "@/lib/updates/impact";

export const runtime = "nodejs";

/** Approved framework version updates. */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await listVersionUpdates());
});
