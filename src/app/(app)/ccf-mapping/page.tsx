import { Suspense } from "react";
import { TERMS } from "@/lib/terms";
import { CcfCrossMappingView } from "./ccf-mapping";

export const metadata = { title: TERMS.ccfMapping };

/** CCF Cross Mapping: custom controls against every framework, at control level. */
export default function CcfMappingPage() {
  return (
    <Suspense>
      <CcfCrossMappingView />
    </Suspense>
  );
}
