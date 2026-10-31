import { Suspense } from "react";
import { VersionImpact } from "./version-impact";

export const metadata = { title: "Version Impact" };

export default function VersionImpactPage() {
  return (
    <Suspense>
      <VersionImpact />
    </Suspense>
  );
}
