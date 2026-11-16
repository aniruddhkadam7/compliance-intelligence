"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { warmRoute } from "@/lib/client/prefetch";
import { cn } from "@/lib/utils";
import { EyLogo } from "./ey-logo";
import { NAV } from "./nav";

/**
 * Left navigation. `collapsed` narrows it to icons only (labels as tooltips, counts as a dot); `onToggle` shows the
 * collapse button. The mobile drawer always opens expanded and has no toggle.
 */
export function Sidebar({ badges, role, onNavigate, collapsed = false, onToggle }: {
  badges: { updates: number }; role?: string; onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void;
}) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  // At the top: beside the title when expanded, under the logo when collapsed.
  const toggle = onToggle && (
    <Tooltip side="right" content={collapsed ? "Expand menu" : "Collapse menu"}>
      <button
        type="button" onClick={onToggle} aria-label={collapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!collapsed}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-fg"
      >
        {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
      </button>
    </Tooltip>
  );
  return (
    <aside className={cn("flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200", collapsed ? "w-[64px]" : "w-[268px]")}>
      <div className={cn("flex h-12 items-center border-b border-border", collapsed ? "justify-center px-0" : "gap-2.5 pl-4 pr-2")}>
        <EyLogo className="h-7 w-7 text-fg" />
        {!collapsed && (
          <>
            <span className="h-6 w-px bg-border" aria-hidden />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-semibold tracking-tight">Compliance Intelligence</div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-subtle">Demonstration</div>
            </div>
            {toggle}
          </>
        )}
      </div>
      {collapsed && toggle && <div className="flex justify-center border-b border-border py-2">{toggle}</div>}
      <nav className={cn("scrollbar-thin flex flex-1 flex-col justify-evenly gap-3 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {NAV.map((group) => (
          <div key={group.section}>
            {collapsed
              ? <div className="mx-2 mb-1.5 border-t border-border" aria-hidden />
              : <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{group.section}</div>}
            {group.items.filter((item) => !item.adminOnly || role === "admin").map((item) => {
              const active = isActive(item.href);
              const count = item.badgeKey ? badges[item.badgeKey] : 0;
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  // Default (partial) prefetch: only the loading skeleton is fetched ahead, so a click shows the page frame
                  // at once. A full prefetch rendered every sidebar page on the server at load, queuing ~10 heavy renders
                  // on the database ahead of the page the user actually clicked.
                  onMouseEnter={() => warmRoute(qc, item.href)}
                  onFocus={() => warmRoute(qc, item.href)}
                  onClick={onNavigate}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex h-10 items-center rounded-md text-[14px] font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "gap-3 px-2.5",
                    active ? "bg-accent-soft text-accent shadow-[inset_2px_0_0_#ffe600]" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
                  )}
                >
                  <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-muted group-hover:text-fg-2")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {count > 0 && (collapsed
                    ? <span className="absolute right-2 top-2 size-2 rounded-full bg-warning" aria-hidden />
                    : <span title={`${count} update(s) ready to install`} className="ml-auto rounded-[4px] bg-warning-soft px-1.5 text-[10px] font-semibold leading-4 text-warning tabular">{count}</span>)}
                </Link>
              );
              return collapsed
                ? <Tooltip key={item.href} side="right" content={count > 0 ? `${item.label} (${count})` : item.label}>{link}</Tooltip>
                : link;
            })}
          </div>
        ))}
      </nav>
      {!collapsed && (
        <div className="border-t border-border px-4 py-3 text-[11px] leading-snug text-subtle">
          <div className="mb-1 font-semibold text-muted">Prepared by EY</div>
          Prototype for demonstration; not a certified compliance system.
        </div>
      )}
    </aside>
  );
}
