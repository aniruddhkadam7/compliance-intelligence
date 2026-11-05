import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { listSources } from "@/lib/queries/sources";
import { demoFrameworks, getDemoState, isReleased, statusOf } from "@/lib/demo/state";
import { AdminConsole, type DraftQuality, type ReleaseRow } from "./admin-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Console" };

export default async function AdminPage() {
  const session = await getSession();
  if (session?.role !== "admin") notFound();
  const [docs, drafts, fws, state] = await Promise.all([
    listSources(),
    prisma.aiIngestion.findMany({ where: { status: "READY", matchKind: "NEW_VERSION" }, select: { id: true, detected: true, fileName: true, _count: { select: { sections: true } } } }),
    demoFrameworks(),
    getDemoState(),
  ]);
  // Newer versions already in the library that users can install from Sources once an admin releases them.
  const releases: ReleaseRow[] = fws.filter((u) => u.release && u.previousId && u.currentId)
    .map((u) => ({ key: u.key, family: u.family, previous: u.previous, current: u.current, previousId: u.previousId!, currentId: u.currentId!, status: statusOf(state, u.key), released: isReleased(state, u.key) }));
  // Extraction quality of each uploaded draft, shown before the admin releases it to users.
  const quality: Record<string, DraftQuality> = Object.fromEntries(drafts.map((x) => {
    const q = ((x.detected ?? {}) as { quality?: { verified?: number; unverified?: number; warnings?: string[] } }).quality;
    return [x.id, { fileName: x.fileName, sections: x._count.sections, unverified: q?.unverified ?? 0, warnings: q?.warnings ?? [] }];
  }));
  return <AdminConsole docs={JSON.parse(JSON.stringify(docs))} quality={quality} releases={releases} />;
}
