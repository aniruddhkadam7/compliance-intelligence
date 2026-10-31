import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 py-px text-[11px] font-medium leading-4 [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-3 text-fg-2",
        accent: "border-transparent bg-accent-soft text-accent",
        info: "border-transparent bg-info-soft text-info",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-danger-soft text-danger",
        outline: "border-border bg-transparent text-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const dotTone = { neutral: "bg-subtle", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", accent: "bg-accent", outline: "bg-subtle" };

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", dotTone[tone], className)} />;
}
