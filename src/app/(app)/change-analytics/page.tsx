import { Suspense } from "react";
import { TERMS } from "@/lib/terms";
import { ChangeAnalytics } from "./change-analytics";

export const metadata = { title: TERMS.versionImpact };

/** Change Analytics (previously Version Impact): approved framework changes and their client-control impact. */
export default function ChangeAnalyticsPage() {
  return (
    <Suspense>
      <ChangeAnalytics />
    </Suspense>
  );
}
