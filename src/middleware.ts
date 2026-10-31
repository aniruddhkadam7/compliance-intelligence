import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

// Everything requires a session except the login flow and the cron endpoint
// (which authenticates with CRON_SECRET itself).
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = NextResponse.next();
    res.headers.set("X-Frame-Options", "DENY");
    return res;
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
