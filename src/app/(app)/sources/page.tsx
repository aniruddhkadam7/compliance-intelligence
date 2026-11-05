import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { listSources } from "@/lib/queries/sources";
import { demoFrameworks, getDemoState, isReleased, statusOf } from "@/lib/demo/state";
import { SourcesCatalog } from "./sources-catalog";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.sourceIndex };

export default async function SourcesPage() {
  const [docs, session, fws, state] = await Promise.all([listSources(), getSession(), demoFrameworks(), getDemoState()]);
  const demo = fws.map((u) => ({ ...u, status: statusOf(state, u.key), released: isReleased(state, u.key) }));
  return (
    <Suspense>
      <SourcesCatalog docs={JSON.parse(JSON.stringify(docs))} demo={demo} role={session?.role ?? "viewer"} />
    </Suspense>
  );
}
