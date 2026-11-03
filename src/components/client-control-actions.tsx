"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FlaskConical, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client/api";

/** Template download, upload link and (when the client layer is empty) the ten labelled sample controls. */
export function ClientControlActions({ empty, showUpload = true }: { empty: boolean; showUpload?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const loadSamples = async () => {
    setBusy(true);
    try {
      const r = await apiSend<{ counts: Record<string, number> }>("/api/data/sample-controls");
      toast.success(`Loaded ${r.counts.controls ?? 0} sample controls (labelled SAMPLE-, not client data)`);
      qc.invalidateQueries();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load sample controls");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-wrap justify-center gap-2">
      {showUpload && <Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Upload control workbook</Link></Button>}
      <Button asChild><a href="/api/templates/client-controls"><Download /> Download Excel template</a></Button>
      {empty && <Button variant="ghost" disabled={busy} onClick={loadSamples}>{busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Load 10 sample controls</Button>}
    </span>
  );
}
