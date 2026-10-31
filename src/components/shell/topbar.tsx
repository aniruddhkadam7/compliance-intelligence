"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/client/api";
import { formatRelative, truncate } from "@/lib/utils";
import { EyLogo } from "./ey-logo";
import { GlobalSearch } from "./global-search";

interface UpdateLite {
  id: string;
  title: string;
  changeType: string;
  detectedAt: string;
  connector: { name: string };
}

export function Topbar({ user, role, onMenu }: { user: string; role: string; onMenu: () => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data } = useQuery({
    queryKey: ["updates", "new"],
    queryFn: () => apiGet<{ items: UpdateLite[]; total: number }>("/api/updates?status=NEW&pageSize=6"),
    refetchInterval: 60_000,
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu />
      </Button>
      <EyLogo className="h-6 w-6 text-fg lg:hidden" />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
              <Bell />
              {!!data?.total && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-warning" />}
            </Button>
          </DropdownTrigger>
          <DropdownContent className="w-[340px] p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[13px] font-semibold">Framework updates</span>
              <Badge tone={data?.total ? "warning" : "neutral"}>{data?.total ?? 0} to review</Badge>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1">
              {!data?.items.length && <p className="px-3 py-6 text-center text-xs text-muted">No unreviewed updates.</p>}
              {data?.items.map((u) => (
                <DropdownItem key={u.id} onSelect={() => router.push(`/updates?update=${u.id}`)} className="flex-col items-start gap-0.5">
                  <span className="text-[13px] text-fg">{truncate(u.title, 70)}</span>
                  <span className="text-[11px] text-muted">{u.connector.name} · {formatRelative(u.detectedAt)}</span>
                </DropdownItem>
              ))}
            </div>
            <div className="border-t border-border px-3 py-2">
              <Link href="/updates" className="text-xs font-medium text-accent hover:underline">Open update centre</Link>
            </div>
          </DropdownContent>
        </Dropdown>
        <Button
          variant="ghost" size="icon-sm" aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {/* Icon chosen by CSS so server and client markup match. */}
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 pl-1.5">
              <span className="grid size-6 place-items-center rounded-full bg-surface-3 text-fg-2"><User className="size-3.5" /></span>
              <span className="hidden text-[13px] sm:inline">{user}</span>
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>Signed in as {user}</DropdownLabel>
            <div className="px-2 pb-1.5"><Badge tone="accent" className="capitalize">{role}</Badge></div>
            <DropdownSeparator />
            <DropdownItem onSelect={logout}><LogOut /> Sign out</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </header>
  );
}
