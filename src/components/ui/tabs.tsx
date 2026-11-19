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
        // Active tab: a thick EY-yellow underline and a bold label in the main text color; inactive tabs stay muted.
        "relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-[3px] border-transparent px-3 text-[13px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-[#ffe600] data-[state=active]:font-semibold data-[state=active]:text-fg [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: T.TabsContentProps) {
  return <T.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
