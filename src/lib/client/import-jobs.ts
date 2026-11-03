"use client";
import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiSend } from "@/lib/client/api";

export interface ImportJob { id: string; name: string; href: string; done: number; total: number; state: "reading" | "ready" | "failed" }

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
  jobs = [...jobs.filter((j) => j.id !== id), { id, name, href, done: initial.chunksDone, total: initial.chunks, state: "reading" }];
  emit();
  let state: ImportJob["state"] = "failed";
  try {
    for (;;) {
      const r = await apiSend<{ status: string; chunksDone: number; chunks: number; error: string | null }>(`/api/ai-import/${id}/step`);
      qc.setQueryData<Record<string, unknown>>(["ai-import", id], (old) => (old ? { ...old, ...r } : old));
      patch(id, { done: r.chunksDone, total: r.chunks });
      if (r.status !== "EXTRACTING") { state = r.status === "FAILED" ? "failed" : "ready"; break; }
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Reading failed");
  } finally {
    qc.invalidateQueries({ queryKey: ["ai-import", id] });
    qc.invalidateQueries({ queryKey: ["ai-imports"] });
  }
  patch(id, { state });
  if (state === "ready") toast.success(`${name} has been read and is ready for review`);
  else toast.error(`Reading ${name} failed`);
}
