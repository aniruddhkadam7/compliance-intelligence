import { handle, requireSession } from "@/lib/auth/server";
import { buildTemplate } from "@/lib/ingest/client-template";

export const runtime = "nodejs";

/** Downloadable custom control template (Excel). */
export const GET = handle(async () => {
  await requireSession();
  return new Response(buildTemplate(), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="client-control-template.xlsx"' },
  });
});
