import { Suspense } from "react";
import { getSession } from "@/lib/auth/server";
import { TERMS } from "@/lib/terms";
import { ChangeAnalytics } from "./change-analytics";

export const metadata = { title: TERMS.versionImpact };

/** Change Analytics (previously Version Impact): approved framework changes and their client-control impact. */
export default async function ChangeAnalyticsPage() {
  const session = await getSession();
  return (
    <Suspense>
      <ChangeAnalytics canWrite={session?.role === "admin" || session?.role === "analyst"} />
    </Suspense>
  );
}
