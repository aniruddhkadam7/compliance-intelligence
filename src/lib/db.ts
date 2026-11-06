import { PrismaClient } from "@prisma/client";

// Reuse one client per serverless instance / dev hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Pooled (PgBouncer) connections such as Neon's "-pooler" host need Prisma's pgbouncer mode. */
function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("-pooler") && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    // Requests wait up to 60 s for a free connection (Prisma's default is 10 s). With a single connection, such as
    // the local PGlite server, a page opened during an import otherwise failed outright instead of loading after it.
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "60");
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
