import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { ccfCrossMapping } from "@/lib/queries/custom-mapping";

export const runtime = "nodejs";

/** CCF cross mapping: every custom control with the framework sections it is mapped to. */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await ccfCrossMapping());
});
