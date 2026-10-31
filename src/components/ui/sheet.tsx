"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Right-hand detail panel. */
export function Sheet({
  open, onOpenChange, title, description, children, width = "w-[min(680px,100vw)]", actions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  actions?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[#0c1b33]/20" />
        <D.Content className={cn("fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-surface shadow-pop focus:outline-none", width)}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-[15px] font-semibold text-fg">{title}</D.Title>
              <D.Description className={description ? "mt-0.5 text-xs text-muted" : "sr-only"}>{description ?? "Details"}</D.Description>
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <D.Close className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </D.Close>
            </div>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Dialog({
  open, onOpenChange, title, description, children, footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[#0c1b33]/25" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface shadow-pop focus:outline-none">
          <div className="px-5 pt-4">
            <D.Title className="text-[15px] font-semibold">{title}</D.Title>
            <D.Description className={description ? "mt-1 text-[13px] text-muted" : "sr-only"}>{description ?? "Dialog"}</D.Description>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
