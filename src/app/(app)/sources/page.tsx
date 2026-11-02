import { Suspense } from "react";
import { listSources } from "@/lib/queries/sources";
import { SourcesCatalog } from "./sources-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

export default async function SourcesPage() {
  const docs = await listSources();
  return (
    <Suspense>
      <SourcesCatalog docs={JSON.parse(JSON.stringify(docs))} />
    </Suspense>
  );
}
