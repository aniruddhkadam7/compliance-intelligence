import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const updates = await prisma.frameworkUpdate.count({ where: { reviewStatus: "NEW" } });
  return (
    <AppShell user={session.sub} role={session.role} badges={{ updates }}>
      {children}
    </AppShell>
  );
}
