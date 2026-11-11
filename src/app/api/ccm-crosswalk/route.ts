import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { ccmCrosswalk } from "@/lib/queries/ccm-crosswalk";

export const runtime = "nodejs";

/** CCM-based cross-framework mapping: every CSA CCM control with the controls it is mapped to (read-only). */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await ccmCrosswalk());
});
