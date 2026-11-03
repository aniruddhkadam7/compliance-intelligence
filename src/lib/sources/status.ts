// Display labels for source update and finding review states (shared by server and client components).
import type { Tone } from "@/components/ui/badge";

export const UPDATE_STATUS = {
  REVIEW: { label: "Awaiting review", tone: "warning" as const },
  MONITORED: { label: "Monitored", tone: "info" as const },
  NOT_MONITORED: { label: "Manual updates", tone: "neutral" as const },
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "Awaiting review", tone: "warning" },
  ACKNOWLEDGED: { label: "Reviewed", tone: "success" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
};
