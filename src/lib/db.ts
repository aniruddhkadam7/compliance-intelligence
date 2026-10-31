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
