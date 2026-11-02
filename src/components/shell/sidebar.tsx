"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { EyLogo } from "./ey-logo";
import { NAV } from "./nav";

export function Sidebar({ badges, onNavigate }: { badges: { updates: number }; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex h-full w-[248px] flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
        <EyLogo className="h-7 w-7 text-fg" />
        <span className="h-6 w-px bg-border" aria-hidden />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Compliance Intelligence</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-subtle">Demonstration</div>
        </div>
      </div>
      <nav className="scrollbar-thin flex flex-1 flex-col justify-evenly gap-3 overflow-y-auto px-3 py-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{group.section}</div>
            {group.items.map((item) => {
              const active = isActive(item.href);
              const count = item.badgeKey ? badges[item.badgeKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-md px-2.5 text-[14px] font-medium transition-colors",
                    active ? "bg-accent-soft text-accent shadow-[inset_2px_0_0_#ffe600]" :"text-fg-2 hover:bg-surface-3 hover:text-fg",
                  )}
                >
                  <item.icon className={cn("size-[18px]", active ? "text-accent" : "text-muted group-hover:text-fg-2")} />
                  <span className="truncate">{item.label}</span>
                  {count > 0 && (
                    <span className="ml-auto rounded-[4px] bg-warning-soft px-1.5 text-[10px] font-semibold leading-4 text-warning tabular">{count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-border px-4 py-3 text-[11px] leading-snug text-subtle">
        <div className="mb-1 font-semibold text-muted">Prepared by EY</div>
        Prototype for demonstration; not a certified compliance system.
      </div>
    </aside>
  );
}
