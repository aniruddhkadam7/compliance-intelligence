"use client";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { useQuery } from "@tanstack/react-query";
import { Library, Quote, Search, ShieldCheck, ListTree } from "lucide-react";
import { apiGet, qs } from "@/lib/client/api";
import { useDebounced } from "@/lib/client/hooks";
import { cn, truncate } from "@/lib/utils";

interface Hit {
  type: "framework" | "citation" | "control" | "requirement";
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

const ICON = { framework: Library, citation: Quote, control: ShieldCheck, requirement: ListTree };
const GROUP = { framework: "Frameworks", control: "CCF controls", requirement: "Integrated requirements", citation: "Citations" };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q, 200);
  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => apiGet<{ hits: Hit[] }>(`/api/search${qs({ q: dq })}`),
    enabled: dq.trim().length >= 2,
  });
  const hits = data?.hits ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    navigate(h.href);
  }

  return (
    <div className="relative w-full max-w-[460px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && hits[active]) go(hits[active]);
          if (e.key === "Escape") inputRef.current?.blur();
        }}
        placeholder="Search controls, requirements, citations, frameworks…"
        aria-label="Global search"
        className="h-8 w-full rounded-md border border-border bg-surface-2 pl-8 pr-12 text-[13px] placeholder:text-subtle focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1 font-mono text-[10px] text-subtle">Ctrl K</kbd>
      {open && dq.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-10 z-50 max-h-[420px] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-pop">
          {isFetching && !hits.length && <p className="px-3 py-4 text-xs text-muted">Searching…</p>}
          {!isFetching && !hits.length && <p className="px-3 py-4 text-xs text-muted">No matches for “{dq}”.</p>}
          {hits.map((h, i) => {
            const Icon = ICON[h.type];
            const first = i === 0 || hits[i - 1].type !== h.type;
            return (
              <div key={`${h.type}-${h.id}`}>
                {first && <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">{GROUP[h.type]}</div>}
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(h)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-start gap-2.5 rounded-[4px] px-2 py-1.5 text-left", i === active && "bg-surface-3")}
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-fg">{h.label}</span>
                    <span className="block truncate text-[11px] text-muted">{truncate(h.sublabel, 90)}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
