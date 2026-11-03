import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { controlCoverage, frameworkConnection, MATRIX_BASES, matrixPairs } from "@/lib/queries/framework-matrix";

const Basis = z.enum(MATRIX_BASES).default("supplied");

/** Framework Matrix: ?view=pairs&basis=, ?view=coverage, or ?view=connection&a=&b=&basis=. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const sp = new URL(req.url).searchParams;
  const basis = Basis.parse(sp.get("basis") ?? undefined);
  const view = sp.get("view");
  if (view === "coverage") return NextResponse.json(await controlCoverage());
  if (view === "connection") {
    const id = z.string().min(1).max(40);
    return NextResponse.json(await frameworkConnection(id.parse(sp.get("a")), id.parse(sp.get("b")), basis));
  }
  return NextResponse.json(await matrixPairs(basis));
});
