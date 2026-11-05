import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSession } from "@/lib/auth/server";
import { DEMO_KEYS, getDemoState, isReleased, statusOf } from "@/lib/demo/state";
import { releasedUpdateCount } from "@/lib/queries/sources";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Sources badge: framework updates released to users and not yet applied or rejected, plus released uploads.
  const [state, uploads] = await Promise.all([getDemoState(), releasedUpdateCount()]);
  const updates = DEMO_KEYS.filter((k) => statusOf(state, k) === "AVAILABLE" && isReleased(state, k)).length + uploads;
  return (
    <AppShell user={session.sub} role={session.role} badges={{ updates }}>
      {children}
    </AppShell>
  );
}
