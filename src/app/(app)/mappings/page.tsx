import { Suspense } from "react";
import { MappingExplorer } from "./explorer";

export const metadata = { title: "Framework Mapping" };

export default function MappingsPage() {
  return (
    <Suspense>
      <MappingExplorer />
    </Suspense>
  );
}
