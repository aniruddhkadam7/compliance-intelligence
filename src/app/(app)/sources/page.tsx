import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { listSources } from "@/lib/queries/sources";
import { demoFrameworks, getDemoState, isReleased, statusOf } from "@/lib/demo/state";
import publication from "@/data/publication-dates.json";
import changes from "@/data/change-summaries.json";
import { SourcesCatalog } from "./sources-catalog";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.sourceIndex };

export default async function SourcesPage() {
  const [docs, session, fws, state] = await Promise.all([listSources(), getSession(), demoFrameworks(), getDemoState()]);
  // "Last published date" comes from the Authoritative Sources sheet, by Source ID. A version it does not list has no date.
  const dates = publication.dates as Record<string, string>;
  const sourceIdOf = (id: string | null) => docs.find((d) => d.id === id)?.sourceId;
  const demo = fws.map((u) => ({ ...u, status: statusOf(state, u.key), released: isReleased(state, u.key), published: dates[sourceIdOf(u.currentId) ?? ""] ?? null }));
  return (
    <Suspense>
      <SourcesCatalog docs={JSON.parse(JSON.stringify(docs))} demo={demo} dates={dates} summaries={changes.items} role={session?.role ?? "viewer"} />
    </Suspense>
  );
}
