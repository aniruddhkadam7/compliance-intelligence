import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, WRITE_ROLES, type Role, type Session } from "./session";

/**
 * Demo accounts from AUTH_USERS ("user:password:role,..."). The rest of the app only
 * depends on `Session`, so this can be swapped for SSO (OIDC/SAML) without other changes.
 */
export function authenticate(username: string, password: string): Session | null {
  const entries = (process.env.AUTH_USERS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const [u, p, role] = entry.split(":");
    if (!u || !p || !role) continue;
    const a = Buffer.from(password);
    const b = Buffer.from(p);
    if (u === username && a.length === b.length && timingSafeEqual(a, b)) return { sub: u, role: role as Role };
  }
  return null;
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Throws HttpError(401/403). Use inside route handlers wrapped by `handle`. */
export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Authentication required.");
  if (roles && !roles.includes(s.role)) throw new HttpError(403, `Role "${s.role}" is not permitted to perform this action.`);
  return s;
}

export const requireWriter = () => requireSession(WRITE_ROLES);

/** Wraps a route handler with consistent JSON error responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e && (e as { name?: string }).name === "ZodError")
        return NextResponse.json({ error: "Invalid request.", details: (e as { issues: unknown }).issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
  };
}
