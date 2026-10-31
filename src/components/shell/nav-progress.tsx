"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const NAV_START = "nav:start";

/** router.push that also starts the progress bar (for row clicks, search results, graph nodes). */
export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      if (new URL(href, location.href).pathname !== location.pathname) window.dispatchEvent(new Event(NAV_START));
      router.push(href);
    },
    [router],
  );
}

/**
 * Thin top progress bar for page navigations. The App Router has no navigation events,
 * so it starts on clicks of internal links to another page and completes when the
 * pathname changes. Gives immediate feedback while a server-rendered page loads.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = () => {
      setProgress(8);
      if (timer.current) clearInterval(timer.current);
      // Ease towards 90% until the new page arrives.
      timer.current = setInterval(() => setProgress((p) => (p === null ? null : Math.min(90, p + (90 - p) * 0.08))), 200);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAV_START, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAV_START, start);
    };
  }, []);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    setProgress((p) => (p === null ? null : 100));
    const t = setTimeout(() => setProgress(null), 250);
    return () => clearTimeout(t);
  }, [pathname]);

  if (progress === null) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5" role="progressbar" aria-label="Loading page" aria-valuenow={Math.round(progress)}>
      <div className="h-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />
    </div>
  );
}
