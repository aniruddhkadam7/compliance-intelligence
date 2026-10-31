import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { listTransitions, versionFamilies } from "@/lib/queries/version";

export const GET = handle(async () => {
  await requireSession();
  const [families, transitions] = await Promise.all([versionFamilies(), listTransitions()]);
  return NextResponse.json({ families, transitions });
});
