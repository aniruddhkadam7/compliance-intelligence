import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { getUploadFolderUrl, setUploadFolderUrl } from "@/lib/settings/upload-folder";

export const runtime = "nodejs";

/** The shared upload folder link, shown next to every upload control. */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json({ url: await getUploadFolderUrl() });
});

const Body = z.object({ url: z.union([z.string().trim().url().startsWith("https://", "Use the folder's https:// link.").max(2000), z.literal(""), z.null()]) });

/** Admin: set or clear the shared upload folder link. */
export const PUT = handle(async (req: Request) => {
  const session = await requireSession(["admin"]);
  const { url } = Body.parse(await req.json());
  const saved = await setUploadFolderUrl(url || null);
  await prisma.auditLog.create({ data: { actor: session.sub, role: session.role, action: "UPLOAD_FOLDER_SET", entity: "Setting", details: { url: saved } } });
  return NextResponse.json({ url: saved });
});
