"use client";
import * as React from "react";
import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
}

const ALL = "__all__";

/** Compact select. `allLabel` adds a "clear" option that maps to an empty value. */
export function Select({
  value, onChange, options, placeholder = "Select…", allLabel, triggerClassName, "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  allLabel?: string;
  triggerClassName?: string;
  "aria-label"?: string;
}) {
  const current = value === "" ? (allLabel ? ALL : undefined) : value;
  return (
    <S.Root value={current} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <S.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 min-w-[140px] items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-fg shadow-xs hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring data-[placeholder]:text-subtle",
          triggerClassName,
        )}
      >
        <span className="truncate"><S.Value placeholder={placeholder} /></span>
        <S.Icon><ChevronDown className="size-3.5 text-muted" /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="z-50 max-h-[340px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-pop">
          <S.Viewport className="scrollbar-thin max-h-[338px] overflow-y-auto p-1">
            {allLabel && <Item value={ALL} label={allLabel} />}
            {options.map((o) => <Item key={o.value} value={o.value} label={o.label} hint={o.hint} />)}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

function Item({ value, label, hint }: Option) {
  return (
    <S.Item value={value} className="relative flex cursor-default select-none items-center gap-2 rounded-[4px] py-1.5 pl-7 pr-2 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-3">
      <S.ItemIndicator className="absolute left-2"><Check className="size-3.5 text-accent" /></S.ItemIndicator>
      <S.ItemText>{label}</S.ItemText>
      {hint != null && <span className="ml-auto pl-3 text-[11px] text-subtle tabular">{hint}</span>}
    </S.Item>
  );
}
