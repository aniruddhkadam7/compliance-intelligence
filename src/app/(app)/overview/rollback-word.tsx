"use client";
import { useRef } from "react";
import { apiSend } from "@/lib/client/api";
import { useMe } from "@/lib/client/use-me";

/**
 * A word of the Overview heading that doubles as the hidden demo rollback: it reads as plain heading text and shows it
 * is a link only on hover. A click silently restores the demo-ready state and reloads the page. Plain text for viewers.
 */
export function RollbackWord({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const busy = useRef(false);
  if (!me?.canWrite) return <>{children}</>;
  const rollback = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await apiSend("/api/demo", { action: "rollback" });
    } catch {
      // Silent by design; the page reload below shows the current state either way.
    } finally {
      window.location.reload();
    }
  };
  return (
    <a
      role="button"
      tabIndex={-1}
      onClick={rollback}
      className="cursor-text text-inherit no-underline decoration-[#ffe600] decoration-2 underline-offset-[6px] hover:cursor-pointer hover:underline"
    >
      {children}
    </a>
  );
}
