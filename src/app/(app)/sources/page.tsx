import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { listSources } from "@/lib/queries/sources";
import { SourcesCatalog } from "./sources-catalog";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.sourceIndex };

export default async function SourcesPage() {
  const [docs, session] = await Promise.all([listSources(), getSession()]);
  return (
    <Suspense>
      <SourcesCatalog docs={JSON.parse(JSON.stringify(docs))} role={session?.role ?? "viewer"} />
    </Suspense>
  );
}
