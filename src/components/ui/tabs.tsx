"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn("flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: T.TabsContentProps) {
  return <T.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
