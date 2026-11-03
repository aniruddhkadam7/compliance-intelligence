"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client/api";

/** Human validation of a detected finding. Recording a review never changes client mappings. */
export function ReviewButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const review = async (reviewStatus: "ACKNOWLEDGED" | "DISMISSED") => {
    setBusy(true);
    try {
      await apiSend(`/api/updates/${id}`, { reviewStatus }, "PATCH");
      toast.success(reviewStatus === "ACKNOWLEDGED" ? "Finding approved" : "Finding dismissed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex gap-1">
      <Button size="sm" variant="primary" disabled={busy} onClick={() => review("ACKNOWLEDGED")}><Check /> Approve</Button>
      <Button size="sm" disabled={busy} onClick={() => review("DISMISSED")}><X /> Dismiss</Button>
    </span>
  );
}
