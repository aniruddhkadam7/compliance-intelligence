// Edge-safe session primitives (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cip_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type Role = "admin" | "analyst" | "viewer";
export interface Session {
  sub: string;
  role: Role;
}

/** Roles allowed to change data (imports, connector actions, update review). */
export const WRITE_ROLES: Role[] = ["admin", "analyst"];

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (>= 32 chars).");
  return new TextEncoder().encode(s);
}

export async function signSession(session: Session) {
  return new SignJWT({ role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    if (!payload.sub || !["admin", "analyst", "viewer"].includes(role)) return null;
    return { sub: payload.sub, role };
  } catch {
    return null;
  }
}
