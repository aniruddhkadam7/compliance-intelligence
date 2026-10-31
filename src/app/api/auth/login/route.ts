import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticate, handle, HttpError } from "@/lib/auth/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";

const Body = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });

export const POST = handle(async (req: Request) => {
  const { username, password } = Body.parse(await req.json());
  const session = authenticate(username, password);
  if (!session) {
    await prisma.auditLog.create({ data: { actor: username, action: "LOGIN_FAILED", entity: "Session" } });
    throw new HttpError(401, "Invalid username or password.");
  }
  await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: "LOGIN", entity: "Session" } });
  const res = NextResponse.json({ user: session.sub, role: session.role });
  res.cookies.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  return res;
});
