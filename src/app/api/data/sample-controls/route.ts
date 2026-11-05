import { NextResponse } from "next/server";
import { handle, requireWriter } from "@/lib/auth/server";
import { loadSampleControls } from "@/lib/ingest/sample-controls";
import { recordControlUpload } from "@/lib/demo/state";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Loads the ten labelled sample controls (only into an empty client layer). */
export const POST = handle(async () => {
  const session = await requireWriter();
  const out = await loadSampleControls(session.sub);
  await recordControlUpload();
  return NextResponse.json({ status: out.status, counts: out.counts });
});
