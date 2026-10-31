import { Suspense } from "react";
import { DataCentre } from "./data-centre";

export const metadata = { title: "Data & Imports" };

export default function DataPage() {
  return (
    <Suspense>
      <DataCentre />
    </Suspense>
  );
}
