import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { globalSearch } from "@/lib/queries/search";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const q = z.string().max(120).parse(new URL(req.url).searchParams.get("q") ?? "");
  return NextResponse.json({ hits: await globalSearch(q) });
});
