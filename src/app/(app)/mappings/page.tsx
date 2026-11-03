import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { MappingExplorer } from "./explorer";

export const metadata = { title: TERMS.frameworkMapping };

export default function MappingsPage() {
  return (
    <Suspense>
      <MappingExplorer />
    </Suspense>
  );
}
