import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dueConnectors, ensureConnectors, runConnectorCheck } from "@/lib/connectors/registry";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduled polling (Vercel Cron). Runs connectors whose polling interval has elapsed. */
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureConnectors();
  const due = await dueConnectors();
  const results = [];
  for (const c of due) results.push({ id: c.id, ...(await runConnectorCheck(c.id, { trigger: "SCHEDULED" })) });
  return NextResponse.json({ ran: results.length, results });
}
