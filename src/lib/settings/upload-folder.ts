// The shared SharePoint folder that holds the file to upload for a demo. An admin sets it in the Admin Console; upload
// screens link to it so presenters pick the right file from one shared place, not their own computer.
// Stored as one key-value row in the DemoState table, next to the demo flow state (rollback does not touch it).
import { prisma } from "@/lib/db";

const KEY = "upload-folder-url";

export async function getUploadFolderUrl(): Promise<string | null> {
  const row = await prisma.demoState.findUnique({ where: { key: KEY } });
  const url = (row?.value as { url?: string } | null)?.url;
  return url || null;
}

/** Saves the folder link (an https URL), or clears it with null. */
export async function setUploadFolderUrl(url: string | null) {
  if (!url) {
    await prisma.demoState.deleteMany({ where: { key: KEY } });
    return null;
  }
  await prisma.demoState.upsert({ where: { key: KEY }, create: { key: KEY, value: { url } }, update: { value: { url } } });
  return url;
}
