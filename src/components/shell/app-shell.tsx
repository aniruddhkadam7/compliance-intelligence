"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { NavProgress } from "./nav-progress";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** Remembers the collapsed menu per browser (a convenience; it never fails the page if storage is unavailable). */
const COLLAPSED_KEY = "sidebar-collapsed";

export function AppShell({ user, role, badges, children }: { user: string; role: string; badges: { updates: number }; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1"); } catch { /* storage unavailable: stay expanded */ }
  }, []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1"); } catch { /* not remembered */ }
    return !c;
  });

  return (
    <div className="flex h-dvh overflow-hidden">
      <NavProgress />
      <div className="hidden lg:block">
        <Sidebar badges={badges} role={role} collapsed={collapsed} onToggle={toggle} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#0c1b33]/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-pop">
            <Sidebar badges={badges} role={role} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} role={role} onMenu={() => setMobileOpen(true)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">{children}</main>
      </div>
    </div>
  );
}
