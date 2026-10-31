import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";
import { WRITE_ROLES } from "@/lib/auth/session";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ user: s.sub, role: s.role, canWrite: WRITE_ROLES.includes(s.role) });
}
