"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Table/filter/tab state persisted in the URL so views are linkable.
 * Uses the History API (synced with useSearchParams by Next.js) instead of router.replace,
 * so changing a tab or filter does not re-render the page on the server.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const pathname = usePathname();
  const params = useSearchParams();
  const state = Object.fromEntries(Object.keys(defaults).map((k) => [k, params.get(k) ?? defaults[k]])) as T;

  const set = useCallback(
    (patch: Partial<T>) => {
      // Read the live URL so several updates in one tick compose correctly.
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      // Any filter change resets pagination unless page itself was set.
      if (!("page" in patch)) next.delete("page");
      const s = next.toString();
      window.history.replaceState(null, "", s ? `${pathname}?${s}` : pathname);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname],
  );
  return [state, set] as const;
}
