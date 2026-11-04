"use client";
import { useState } from "react";
import { ArrowRight, ChevronDown, Gauge, Layers, Network, RefreshCcw, ScanSearch, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface Props {
  frameworks: number;
  coverage: { n: number; label: string }[];
}

const STEPS: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: RefreshCcw, title: "Regulatory updates", sub: "New amendments and publications" },
  { icon: ScanSearch, title: "AI analysis", sub: "Identify and interpret changes" },
  { icon: Network, title: "Control mapping", sub: "Map requirements to existing controls" },
];

const CONNECTED: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: Network, title: "Framework relationships", sub: "See how frameworks map to each other" },
  { icon: ShieldCheck, title: "Control coverage", sub: "Link every requirement to the controls you run" },
  { icon: Gauge, title: "Gap visibility", sub: "See what's met, partly met and open" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-success">{children}</div>;
}

/** "What the platform offers": one panel open at a time, the library first. */
export function Capabilities({ frameworks, coverage }: Props) {
  const [open, setOpen] = useState<number | null>(0);
  const items: { icon: LucideIcon; title: string; aside?: React.ReactNode; body: React.ReactNode }[] = [
    {
      icon: Layers, title: "Regulatory Library",
      aside: <span className="flex items-baseline gap-1.5"><b className="text-[13px] font-semibold tabular text-fg">{formatNumber(frameworks)}</b><span className="text-[10px] text-muted">Frameworks</span></span>,
      body: (
        <>
          <Eyebrow>01 / Regulatory Library</Eyebrow>
          <h3 className="mt-1.5 text-[17px] font-semibold tracking-tight text-fg">One connected regulatory library.</h3>
          <p className="mt-1 text-[12.5px] text-muted">Access laws, regulations, standards and frameworks across multiple jurisdictions, all within one consolidated library.</p>
          <div className="mt-3 inline-flex items-baseline gap-2.5 rounded-md border border-border bg-surface px-4 py-2">
            <span className="text-xl font-semibold tabular text-fg">{formatNumber(frameworks)}</span>
            <span className="text-[11px] text-muted">Frameworks supported</span>
          </div>
          <div className="my-4 border-t border-border" />
          <Eyebrow>Framework coverage</Eyebrow>
          <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
            {coverage.map((c) => (
              <div key={c.label} className="bg-surface-2 px-3 py-2.5">
                <div className="text-[15px] font-semibold tabular text-fg">{formatNumber(c.n)}</div>
                <div className="text-[11px] text-muted">{c.label}</div>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      icon: Sparkles, title: "AI-Powered Intelligence",
      body: (
        <div className="border-l-2 border-success pl-5">
          <Eyebrow>02 / AI-Powered Intelligence</Eyebrow>
          <h3 className="mt-1.5 text-[19px] font-semibold leading-snug tracking-tight text-fg">Regulatory changes.<br />Intelligently mapped.</h3>
          <p className="mt-1.5 max-w-xl text-[12.5px] text-muted">AI transforms regulatory updates into structured requirements and relevant control mappings.</p>
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            {STEPS.map((s, i) => (
              <div key={s.title} className="contents">
                <div className="flex-1 rounded-md border border-success/20 bg-success-soft px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-success"><s.icon className="size-3.5" />0{i + 1}</div>
                  <div className="mt-1 text-[12px] font-semibold text-fg">{s.title}</div>
                  <div className="text-[11px] text-muted">{s.sub}</div>
                </div>
                {i < STEPS.length - 1 && <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted md:rotate-0" />}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      icon: Network, title: "Connected Compliance",
      body: (
        <div className="border-l-2 border-success pl-5">
          <Eyebrow>03 / Connected Compliance</Eyebrow>
          <h3 className="mt-1.5 text-[19px] font-semibold leading-snug tracking-tight text-fg">Every requirement.<br />Connected to your controls.</h3>
          <p className="mt-1.5 max-w-xl text-[12.5px] text-muted">See how frameworks relate, which controls cover each requirement, and where gaps remain, in one connected view.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {CONNECTED.map((s) => (
              <div key={s.title} className="rounded-md border border-success/20 bg-success-soft px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-success"><s.icon className="size-3.5" /></div>
                <div className="mt-1 text-[12px] font-semibold text-fg">{s.title}</div>
                <div className="text-[11px] text-muted">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-2.5">
      {items.map((it, i) => {
        const on = open === i;
        return (
          <div key={it.title} className={cn("overflow-hidden rounded-xl border bg-surface shadow-xs transition-colors", on ? "border-success/30" : "border-border")}>
            <button
              onClick={() => setOpen(on ? null : i)}
              aria-expanded={on}
              className={cn("flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors", on ? "bg-success-soft" : "hover:bg-surface-2")}
            >
              <span className={cn("w-5 text-xs tabular", on ? "text-success" : "text-subtle")}>0{i + 1}</span>
              <it.icon className="size-4 text-success" />
              <span className="flex-1 text-[13px] font-medium text-fg">{it.title}</span>
              {it.aside}
              <ChevronDown className={cn("size-4 text-muted transition-transform", on && "rotate-180")} />
            </button>
            <div className={cn("grid transition-[grid-template-rows] duration-300", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden">
                <div className="px-5 pb-5 pt-4">{it.body}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
