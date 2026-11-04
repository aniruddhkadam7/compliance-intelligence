import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { listVersionUpdates } from "@/lib/updates/impact";
import { ensureLibraryComparisons } from "@/lib/updates/compare-library";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Approved framework version updates, including comparisons of versions already in the library. */
export const GET = handle(async () => {
  await requireSession();
  await ensureLibraryComparisons();
  return NextResponse.json(await listVersionUpdates());
});
