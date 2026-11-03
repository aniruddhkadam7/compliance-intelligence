import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { CitationExplorer } from "./explorer";

export const metadata = { title: TERMS.obligations };

export default function CitationsPage() {
  return (
    <Suspense>
      <CitationExplorer />
    </Suspense>
  );
}
