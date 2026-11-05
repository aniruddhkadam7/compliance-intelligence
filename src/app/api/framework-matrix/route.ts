import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { controlCoverage, frameworkConnection, MATRIX_BASES, matrixPairs } from "@/lib/queries/framework-matrix";
import { ensureReferenceMappings } from "@/lib/reference/mappings";

export const runtime = "nodejs";
// The first request after a deploy loads the built-in reference mappings (about 80,000 relationships).
export const maxDuration = 120;

const Basis = z.enum(MATRIX_BASES).default("supplied");

/** Framework Matrix: ?view=pairs&basis=, ?view=coverage, or ?view=connection&a=&b=&basis=. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  // The matrix is only as good as the reference data behind it; a failed load must not break the page.
  await ensureReferenceMappings().catch((e) => console.error("Reference mappings could not be loaded:", e));
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
