"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Loader2, LogOut, Menu, Moon, Sun, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/client/api";
import { formatDate, formatRelative, truncate } from "@/lib/utils";
import { EyLogo } from "./ey-logo";
import { GlobalSearch } from "./global-search";
import { dismissImportJob, useImportJobs } from "@/lib/client/import-jobs";

function ImportStatus() {
  const jobs = useImportJobs();
  if (!jobs.length) return null;
  return (
    <div className="hidden items-center gap-1.5 md:flex">
      {jobs.map((j) => (
        <span key={j.id} className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 py-0.5 pl-2 pr-1 text-xs">
          {j.state === "reading" ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <CheckCircle2 className={j.state === "ready" ? "size-3.5 text-success" : "size-3.5 text-danger"} />}
          <Link href={j.href} className="text-fg hover:underline">
            {j.state === "reading" ? `Reading ${truncate(j.name, 24)} · ${Math.min(j.done + 1, j.total)}/${j.total}` : j.state === "ready" ? `${truncate(j.name, 24)} ready` : `${truncate(j.name, 24)} failed`}
          </Link>
          {j.state !== "reading" && <button type="button" aria-label="Dismiss" onClick={() => dismissImportJob(j.id)} className="cursor-pointer rounded p-0.5 text-muted hover:text-fg"><X className="size-3" /></button>}
        </span>
      ))}
    </div>
  );
}

interface NotificationLite {
  id: string; kind: string; framework: string; fromVersion: string | null; version: string | null;
  date: string | null; dateLabel: string; status: string; detail: string | null; href: string;
}

const KIND_LABEL: Record<string, string> = {
  UPDATE_AVAILABLE: "New version", READY_TO_INSTALL: "New version", VERSION_CHANGE: "Version change", NEW_PUBLICATION: "New publication",
  CONTENT_CHANGE: "Content change", NEW_INFORMATIVE_REFERENCE: "New reference", CONNECTOR_ERROR: "Connector",
};
const STATUS_TONE: Record<string, "warning" | "info" | "danger" | "accent"> = { "Update available": "warning", "Ready to install": "accent", "To review": "info", Error: "danger" };

export function Topbar({ user, role, onMenu }: { user: string; role: string; onMenu: () => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // Same backend state as Sources and the Connector page; refreshed when the panel opens and every minute.
  const { data, refetch } = useQuery({
    queryKey: ["updates", "notifications"],
    queryFn: () => apiGet<{ items: NotificationLite[]; total: number }>("/api/notifications"),
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
        <ImportStatus />
        <Dropdown onOpenChange={(open) => { if (open) void refetch(); }}>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Notifications${data?.total ? ` (${data.total})` : ""}`} className="relative">
              <Bell />
              {!!data?.total && <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-warning px-0.5 text-[9px] font-semibold leading-none text-white tabular">{data.total}</span>}
            </Button>
          </DropdownTrigger>
          <DropdownContent className="w-[400px] p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[13px] font-semibold">Framework updates</span>
              <Badge tone={data?.total ? "warning" : "neutral"}>{data?.total ?? 0} need attention</Badge>
            </div>
            <div className="max-h-[380px] overflow-y-auto p-1">
              {!data?.items.length && <p className="px-3 py-6 text-center text-xs text-muted">No framework updates, findings or connector errors.</p>}
              {data?.items.map((n) => (
                <DropdownItem key={n.id} onSelect={() => router.push(n.href)} className="flex-col items-stretch gap-0.5 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{n.framework}</span>
                    <Badge tone={STATUS_TONE[n.status] ?? "neutral"} className="shrink-0">{n.status}</Badge>
                  </span>
                  <span className="text-[12px] text-fg-2">
                    {KIND_LABEL[n.kind] ?? n.kind}
                    {n.version && <>: {n.fromVersion && n.fromVersion !== n.version && <span className="tabular">{truncate(n.fromVersion, 24)} → </span>}<b className="font-medium tabular">{truncate(n.version, 28)}</b></>}
                  </span>
                  {n.detail && <span className="line-clamp-2 text-[11px] text-muted">{n.detail}</span>}
                  <span className="text-[11px] text-subtle">{n.dateLabel} {n.date ? (n.dateLabel === "Published" ? formatDate(n.date) : formatRelative(n.date)) : "date not available"}</span>
                </DropdownItem>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <Link href="/sources" className="text-xs font-medium text-accent hover:underline">Open Sources</Link>
              <Link href="/updates" className="text-xs font-medium text-accent hover:underline">Open Connectors</Link>
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
