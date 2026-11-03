import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { shortName } from "@/lib/frameworks";
import { TERMS } from "@/lib/terms";
import { UploadNewVersion } from "./upload-new-version";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload new version" };

export default async function UploadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ expected?: string }> }) {
  const { id } = await params;
  const { expected } = await searchParams;
  const [fw, check] = await Promise.all([
    prisma.framework.findUnique({ where: { id }, select: { id: true, name: true, versionLabel: true, documentUrl: true } }),
    prisma.updateCheck.findFirst({ where: { frameworkId: id }, orderBy: { checkedAt: "desc" }, select: { status: true, latestVersion: true, latestDocumentUrl: true, checkedAt: true, message: true } }),
  ]);
  if (!fw) notFound();
  return (
    <UploadNewVersion
      framework={{ id: fw.id, name: fw.name, short: shortName(fw.name), version: fw.versionLabel, documentUrl: fw.documentUrl }}
      check={check ? { ...check, checkedAt: check.checkedAt.toISOString() } : null}
      expected={expected ?? (check?.status === "UPDATE_AVAILABLE" ? check.latestVersion : null) ?? null}
      sourcesLabel={TERMS.sources}
    />
  );
}
