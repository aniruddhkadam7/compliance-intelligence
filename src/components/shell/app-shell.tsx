"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { NavProgress } from "./nav-progress";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ user, role, badges, children }: { user: string; role: string; badges: { updates: number }; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <NavProgress />
      <div className="hidden lg:block">
        <Sidebar badges={badges} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#0c1b33]/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-pop">
            <Sidebar badges={badges} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} role={role} onMenu={() => setMobileOpen(true)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
