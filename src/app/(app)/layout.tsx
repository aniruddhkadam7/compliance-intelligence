import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSession } from "@/lib/auth/server";
import { releasedUpdateCount } from "@/lib/queries/sources";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Sources badge: updates an admin has released and users can install with the Update button.
  const updates = await releasedUpdateCount();
  return (
    <AppShell user={session.sub} role={session.role} badges={{ updates }}>
      {children}
    </AppShell>
  );
}
