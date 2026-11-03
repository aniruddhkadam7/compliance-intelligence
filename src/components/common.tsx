// Server-compatible presentational components (interactive pieces live in client files).
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Inbox, type LucideIcon } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6", className)}>{children}</div>;
}

export function PageHeader({
  title, description, actions, breadcrumbs, meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {breadcrumbs && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-subtle" />}
              {b.href ? <Link href={b.href} className="hover:text-fg">{b.label}</Link> : <span className="text-fg-2">{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Compact metric strip: many metrics in one bordered row rather than oversized cards. */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface shadow-xs sm:grid-cols-4 xl:grid-cols-8", className)}>
      {items.map((s, i) => <Stat key={i} {...s} />)}
    </div>
  );
}

export interface StatItem {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  /** Makes the tile a button (e.g. to filter a table); `active` marks the current selection. */
  onClick?: () => void;
  active?: boolean;
  tone?: "default" | "warning" | "success" | "accent";
  hint?: string;
  icon?: LucideIcon;
}

function Stat({ label, value, sub, href, onClick, active, tone = "default", hint, icon: Icon }: StatItem) {
  const color = { default: "text-fg", warning: "text-warning", success: "text-success", accent: "text-accent" }[tone];
  const body = (
    <div className={cn("flex h-full flex-col gap-1 border-b border-r border-border px-4 py-3 text-left transition-colors hover:bg-surface-2", active && "bg-surface-3")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        {Icon && <Icon className="size-3.5 text-subtle" />}
        <Tooltip content={hint}><span className={hint ? "cursor-help underline decoration-dotted decoration-subtle underline-offset-2" : ""}>{label}</span></Tooltip>
      </div>
      <div className={cn("text-[20px] font-semibold leading-tight tracking-tight tabular", color)}>{typeof value === "number" ? formatNumber(value) : value}</div>
      {sub && <div className="line-clamp-2 text-[11px] leading-snug text-subtle">{sub}</div>}
    </div>
  );
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={!!active} className="-mb-px -mr-px block cursor-pointer text-left">{body}</button>;
  return href ? <Link href={href} className="-mb-px -mr-px">{body}</Link> : <div className="-mb-px -mr-px">{body}</div>;
}

export function EmptyState({
  icon: Icon = Inbox, title, description, action, className,
}: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="mb-3 grid size-9 place-items-center rounded-md border border-border bg-surface-2 text-muted"><Icon className="size-4" /></span>
      <p className="text-[13px] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid size-9 place-items-center rounded-md bg-danger-soft text-danger"><AlertTriangle className="size-4" /></span>
      <p className="text-[13px] font-semibold">Could not load data</p>
      <p className="mt-1 text-xs text-muted">{msg}</p>
      {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-24" : "flex-1")} />)}
        </div>
      ))}
    </div>
  );
}

export { LongText } from "./long-text";

export function KeyValue({ items, cols = 2 }: { items: { label: string; value: React.ReactNode; hint?: string }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[11px] font-medium text-muted">
            <Tooltip content={i.hint}><span className={i.hint ? "cursor-help underline decoration-dotted underline-offset-2" : ""}>{i.label}</span></Tooltip>
          </dt>
          <dd className="mt-0.5 break-words text-[13px] text-fg">{i.value ?? <span className="text-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px] text-fg-2", className)}>{children}</span>;
}

/** "Source: sheet / row / column" provenance chip. */
export function Provenance({ sheet, row, column }: { sheet: string; row?: number | null; column?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] border border-dashed border-border-strong px-1.5 py-px text-[10.5px] text-muted">
      <span className="font-medium text-fg-2">{sheet}</span>
      {row != null && <span>· row {row}</span>}
      {column && <span>· “{column.replace(/\n/g, " ")}”</span>}
    </span>
  );
}

export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{children}</h4>
      {actions}
    </div>
  );
}
