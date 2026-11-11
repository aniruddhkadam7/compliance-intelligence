"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronDown, Gauge, Layers, Network, RefreshCcw, ScanSearch, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface Props {
  frameworks: number;
  /** Source Document Library, current versions. */
  frameworksHref: string;
  coverage: { n: number; label: string; href: string }[];
}

/** Whether a capability works in the platform today or is on the roadmap. A planned one is never shown as available. */
type Availability = "now" | "planned";
interface Step { icon: LucideIcon; title: string; sub: string; status: Availability; href?: string }

const STEPS: Step[] = [
  { icon: RefreshCcw, title: "Regulatory updates", sub: "Connectors detect new versions and publications at the official source", status: "now", href: "/updates" },
  { icon: ScanSearch, title: "AI analysis", sub: "Identify and interpret what changed in a regulation", status: "planned" },
  { icon: Network, title: "Automatic control mapping", sub: "Map new requirements to existing controls. Today's mappings are prepared manually in Excel", status: "planned" },
];

const CONNECTED: Step[] = [
  { icon: Network, title: "Framework relationships", sub: "See how frameworks map to each other", status: "now", href: "/mappings" },
  { icon: ShieldCheck, title: "Control mapping", sub: "Your controls linked to requirements, from the manually prepared mapping workbook", status: "now", href: "/controls" },
  { icon: Gauge, title: "Gap visibility", sub: "Met, partly met and open classification", status: "planned" },
];

function StatusTag({ status }: { status: Availability }) {
  return status === "now"
    ? <span className="rounded bg-success px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-white">Available now</span>
    : <span className="rounded border border-dashed border-border-strong px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-muted">Planned</span>;
}

/** One capability: solid and clickable when available, dashed and muted when planned. */
function StepTile({ s, index }: { s: Step; index?: number }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={cn("flex items-center gap-1.5", s.status === "now" ? "text-success" : "text-muted")}><s.icon className="size-3.5" />{index !== undefined && `0${index + 1}`}</span>
        <StatusTag status={s.status} />
      </div>
      <div className={cn("mt-1 text-[12px] font-semibold", s.status === "now" ? "text-fg" : "text-fg-2")}>{s.title}</div>
      <div className="text-[11px] text-muted">{s.sub}</div>
    </>
  );
  const cls = "block flex-1 rounded-md px-3 py-2.5";
  return s.status === "now" && s.href
    ? <Link href={s.href} className={cn(cls, "border border-success/20 bg-success-soft transition hover:brightness-95")}>{body}</Link>
    : <div className={cn(cls, "border border-dashed border-border bg-surface-2")}>{body}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-success">{children}</div>;
}

/** "What the platform offers": one panel open at a time, the library first. */
export function Capabilities({ frameworks, frameworksHref, coverage }: Props) {
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
          <Link href={frameworksHref} className="mt-3 inline-flex items-baseline gap-2.5 rounded-md border border-border bg-surface px-4 py-2 transition-colors hover:border-border-strong hover:bg-accent-soft">
            <span className="text-xl font-semibold tabular text-fg">{formatNumber(frameworks)}</span>
            <span className="text-[11px] text-muted">Frameworks supported</span>
            <ArrowRight className="size-3 self-center text-muted" />
          </Link>
          <div className="my-4 border-t border-border" />
          <Eyebrow>Framework coverage</Eyebrow>
          <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
            {coverage.map((c) => (
              <Link key={c.label} href={c.href} title={`Open ${c.label} in the ${"Source Document Library"}`} className="group bg-surface-2 px-3 py-2.5 transition-colors hover:bg-accent-soft">
                <div className="text-[15px] font-semibold tabular text-fg">{formatNumber(c.n)}</div>
                <div className="flex items-center gap-1 text-[11px] text-muted group-hover:text-fg">{c.label}<ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" /></div>
              </Link>
            ))}
          </div>
        </>
      ),
    },
    {
      icon: Sparkles, title: "AI-Powered Intelligence", aside: <StatusTag status="planned" />,
      body: (
        <div className="border-l-2 border-success pl-5">
          <Eyebrow>02 / AI-Powered Intelligence</Eyebrow>
          <h3 className="mt-1.5 text-[19px] font-semibold leading-snug tracking-tight text-fg">Regulatory changes.<br />Intelligently mapped.</h3>
          <p className="mt-1.5 max-w-xl text-[12.5px] text-muted">Update detection works today. AI analysis of regulatory text and automatic control mapping are planned; until then, mapping changes are reviewed and approved by people in Change Analytics.</p>
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-stretch">
            {STEPS.map((s, i) => (
              <div key={s.title} className="contents">
                <StepTile s={s} index={i} />
                {i < STEPS.length - 1 && <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 self-center text-muted md:rotate-0" />}
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
          <p className="mt-1.5 max-w-xl text-[12.5px] text-muted">See how frameworks relate and which requirements each of your controls is mapped to. Gap classification is planned; risk assessment is outside this tool&apos;s scope.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {CONNECTED.map((s) => <StepTile key={s.title} s={s} />)}
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
