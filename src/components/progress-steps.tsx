"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep { icon: LucideIcon; title: string; detail: string }

const STEP_MS = 1400;
const DONE_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface State { title: string; steps: ProgressStep[]; items: string[]; at: number }

/**
 * Shown while an update or approval runs, written out the way an AI assistant streams its answer: each step types out
 * in turn and is checked off. `run` starts the work at once and resolves with its result after the last step (closing
 * early if the work fails). `items` (e.g. the frameworks being updated) are listed as they are found.
 */
export function useProgressSteps() {
  const [state, setState] = useState<State | null>(null);
  const run = async <T,>(title: string, steps: ProgressStep[], work: () => Promise<T>, items: string[] = []): Promise<T> => {
    setState({ title, steps, items, at: 0 });
    let failed = false;
    const job = work().catch((e) => { failed = true; throw e; });
    job.catch(() => {}); // awaited below; this only stops an early failure being reported as unhandled
    try {
      for (let i = 0; i < steps.length; i++) {
        if (failed) break;
        setState({ title, steps, items, at: i });
        await sleep(STEP_MS);
      }
      const out = await job;
      setState({ title, steps, items, at: steps.length });
      await sleep(DONE_MS);
      return out;
    } finally {
      setState(null);
    }
  };
  const overlay = <AnimatePresence>{state && <ProgressOverlay key="progress" {...state} />}</AnimatePresence>;
  return { run, overlay, running: !!state };
}

/** Text that types itself out, character by character, with a blinking caret while it is being written. */
function Typed({ text, ms = 14, caret = true }: { text: string; ms?: number; caret?: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 2)), ms);
    return () => clearInterval(t);
  }, [text, ms, reduce]);
  const writing = n < text.length;
  return (
    <span>
      {text.slice(0, n)}
      {caret && writing && <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-fg-2" />}
    </span>
  );
}

/** "Thinking" text: a soft highlight sweeps across it, as AI assistants show while they work. */
function Shimmer({ children }: { children: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="bg-clip-text text-transparent"
      style={{ backgroundImage: "linear-gradient(90deg, var(--muted) 0%, var(--muted) 35%, var(--fg) 50%, var(--muted) 65%, var(--muted) 100%)", backgroundSize: "250% 100%" }}
      animate={reduce ? undefined : { backgroundPosition: ["100% 0%", "-50% 0%"] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

function ProgressOverlay({ title, steps, items, at }: State) {
  const reduce = useReducedMotion();
  const done = at >= steps.length;
  // Items are "found" one by one over the course of the run.
  const found = done ? items.length : Math.min(items.length, Math.ceil(((at + 0.5) / steps.length) * items.length));
  // Like a streamed answer: the newest line stays in view at the bottom and earlier lines move up.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let frame = 0;
    const follow = () => { el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" }); frame = requestAnimationFrame(follow); };
    const stop = setTimeout(() => cancelAnimationFrame(frame), STEP_MS);
    follow();
    return () => { cancelAnimationFrame(frame); clearTimeout(stop); };
  }, [at, found, reduce]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/25 p-4 backdrop-blur-[3px]"
      role="dialog" aria-modal aria-label={title}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="w-full max-w-xl rounded-xl border border-border bg-surface p-5 shadow-lg"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className="flex items-center gap-2.5">
          <motion.span
            className={cn("grid size-7 place-items-center rounded-full", done ? "bg-success-soft text-success" : "bg-accent-soft text-accent")}
            animate={reduce || done ? undefined : { rotate: [0, 12, -12, 0], scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}
          >
            {done ? <Check className="size-4" /> : <Sparkles className="size-4" />}
          </motion.span>
          <div className="text-[14px] font-semibold">
            {done ? <span className="text-fg">{title}: done</span> : <Shimmer>{`${title}…`}</Shimmer>}
          </div>
        </div>

        <div
          ref={body}
          className="mt-4 h-[260px] overflow-hidden"
          style={{ maskImage: "linear-gradient(to bottom, transparent 0, #000 36px, #000 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 36px, #000 100%)" }}
        >
        <div className="flex min-h-full flex-col justify-end pl-2 pt-8">
        <ol className="space-y-2.5 border-l border-border pl-4">
          {steps.map((s, i) => {
            if (i > at) return null;
            const finished = i < at;
            return (
              <motion.li key={s.title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="relative">
                <span className={cn("absolute -left-[21px] top-1.5 size-2 rounded-full ring-4 ring-surface", finished ? "bg-success" : "bg-accent")} />
                <div className="flex items-center gap-1.5 text-[13px]">
                  {finished ? <span className="font-medium text-fg">{s.title}</span> : <span className="font-medium"><Shimmer>{s.title}</Shimmer></span>}
                  {finished && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="size-3.5 text-success" /></motion.span>}
                </div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                  {finished ? s.detail : <Typed text={s.detail} />}
                </div>
              </motion.li>
            );
          })}
        </ol>

        {items.length > 0 && found > 0 && (
          <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-medium text-muted">Found</div>
            <ul className="space-y-1">
              {items.slice(0, found).map((name) => (
                <motion.li key={name} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="flex items-center gap-2 text-[12.5px] text-fg-2">
                  <Check className="size-3.5 shrink-0 text-success" /><Typed text={name} caret={false} />
                </motion.li>
              ))}
            </ul>
          </div>
        )}
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
