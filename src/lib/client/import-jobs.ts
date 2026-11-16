"use client";
import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiSend } from "@/lib/client/api";

/**
 * `phase` while running: reading the document part by part, then comparing it with the previous version (rules plus the
 * AI review, the last and longest step). `since` is when the current phase started, for an elapsed-time display.
 */
export interface ImportJob { id: string; name: string; href: string; done: number; total: number; state: "reading" | "ready" | "failed"; phase: "reading" | "comparing"; since: number }

/** The next server step finishes the import (comparison, AI review, summary) once every part has been read. */
const phaseOf = (done: number, total: number): ImportJob["phase"] => (done >= total ? "comparing" : "reading");

// Module-level so the reading loop and the header indicator survive page changes inside the app.
let jobs: ImportJob[] = [];
const listeners = new Set<() => void>();
const emit = () => { jobs = [...jobs]; listeners.forEach((l) => l()); };
const patch = (id: string, p: Partial<ImportJob>) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j)); emit(); };

export const useImportJobs = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => jobs, () => jobs);
export const dismissImportJob = (id: string) => { jobs = jobs.filter((j) => j.id !== id); emit(); };

/** Reads an AI import one part at a time. Safe to call again for a draft that is already being read. */
export async function driveImport(id: string, name: string, qc: QueryClient, initial: { chunksDone: number; chunks: number }) {
  if (jobs.some((j) => j.id === id && j.state === "reading")) return;
  const href = window.location.pathname + window.location.search;
  jobs = [...jobs.filter((j) => j.id !== id), { id, name, href, done: initial.chunksDone, total: initial.chunks, state: "reading", phase: phaseOf(initial.chunksDone, initial.chunks), since: Date.now() }];
  emit();
  let state: ImportJob["state"] = "failed";
  try {
    for (;;) {
      const r = await apiSend<{ status: string; chunksDone: number; chunks: number; error: string | null }>(`/api/ai-import/${id}/step`);
      qc.setQueryData<Record<string, unknown>>(["ai-import", id], (old) => (old ? { ...old, ...r } : old));
      const phase = phaseOf(r.chunksDone, r.chunks);
      patch(id, { done: r.chunksDone, total: r.chunks, ...(phase !== jobs.find((j) => j.id === id)?.phase && { phase, since: Date.now() }) });
      if (r.status !== "EXTRACTING") { state = r.status === "FAILED" ? "failed" : "ready"; break; }
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Reading failed");
  } finally {
    qc.invalidateQueries({ queryKey: ["ai-import", id] });
    qc.invalidateQueries({ queryKey: ["ai-imports"] });
  }
  patch(id, { state });
  if (state === "ready") toast.success(`${name} is ready for review`, { description: "Read and compared with the previous version. It is also listed in the notifications." });
  else toast.error(`Reading ${name} failed`);
}
