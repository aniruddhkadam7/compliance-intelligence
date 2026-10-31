"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;

export function Tooltip({
  content, children, side = "top", className,
}: { content: React.ReactNode; children: React.ReactNode; side?: T.TooltipContentProps["side"]; className?: string }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className={cn("z-50 max-w-xs rounded-md bg-fg px-2 py-1 text-[11px] leading-snug text-bg shadow-pop", className)}>
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
