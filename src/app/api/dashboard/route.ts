import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth/server";
import { getDashboard } from "@/lib/queries/dashboard";

export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await getDashboard());
});
