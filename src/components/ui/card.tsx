import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface shadow-xs", className)} {...props} />;
}

export function CardHeader({
  title, description, actions, className, icon,
}: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
          {title}
        </h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
