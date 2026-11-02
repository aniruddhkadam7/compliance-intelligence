import { Suspense } from "react";
import { MappingExplorer } from "./explorer";

export const metadata = { title: "Legacy vs Latest" };

export default function MappingsPage() {
  return (
    <Suspense>
      <MappingExplorer />
    </Suspense>
  );
}
