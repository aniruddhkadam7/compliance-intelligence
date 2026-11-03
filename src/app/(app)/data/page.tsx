import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { DataCentre } from "./data-centre";

export const metadata = { title: TERMS.data };

export default function DataPage() {
  return (
    <Suspense>
      <DataCentre />
    </Suspense>
  );
}
