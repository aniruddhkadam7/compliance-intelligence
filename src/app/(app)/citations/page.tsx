import { Suspense } from "react";
import { CitationExplorer } from "./explorer";

export const metadata = { title: "Citation Explorer" };

export default function CitationsPage() {
  return (
    <Suspense>
      <CitationExplorer />
    </Suspense>
  );
}
