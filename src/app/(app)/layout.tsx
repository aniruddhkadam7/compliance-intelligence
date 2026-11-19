import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSession } from "@/lib/auth/server";
import { availableUpdateCount } from "@/lib/queries/sources";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Sources badge: the rows in Sources showing "Update available" that have not been declined.
  const updates = await availableUpdateCount();
  return (
    <AppShell user={session.sub} role={session.role} badges={{ updates }}>
      {children}
    </AppShell>
  );
}
