"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Long workbook text: preserves line breaks, collapses beyond `lines`. */
export function LongText({ text, lines = 6, className, mono }: { text: string | null | undefined; lines?: number; className?: string; mono?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-subtle">—</span>;
  const long = text.split("\n").length > lines || text.length > lines * 110;
  return (
    <div className={className}>
      <div
        className={cn("whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-2", mono && "font-mono text-xs", !open && long && "overflow-hidden")}
        style={!open && long ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" } : undefined}
      >
        {text}
      </div>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-accent hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
