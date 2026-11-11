"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, align = "end", ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-[200px] rounded-md border border-border bg-surface p-1 shadow-pop", className)} {...props} />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: M.DropdownMenuItemProps) {
  return (
    <M.Item
      className={cn("flex cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-3 [&_svg]:size-3.5 [&_svg]:text-muted", className)}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: M.DropdownMenuLabelProps) {
  return <M.Label className={cn("px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle", className)} {...props} />;
}

export const DropdownSeparator = () => <M.Separator className="my-1 h-px bg-border" />;

/** A menu item with a check mark that stays open when toggled, for choosing several options. */
export function DropdownCheckboxItem({ className, children, onSelect, ...props }: M.DropdownMenuCheckboxItemProps) {
  return (
    <M.CheckboxItem
      onSelect={(e) => { e.preventDefault(); onSelect?.(e); }}
      className={cn("relative flex cursor-default select-none items-center gap-2 rounded-[4px] py-1.5 pl-7 pr-2 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-3", className)}
      {...props}
    >
      <M.ItemIndicator className="absolute left-2"><Check className="size-3.5 text-accent" /></M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}
