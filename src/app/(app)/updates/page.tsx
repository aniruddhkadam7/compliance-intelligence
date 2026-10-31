import { Suspense } from "react";
import { UpdateCentre } from "./update-centre";

export const metadata = { title: "Updates & Connectors" };

export default function UpdatesPage() {
  return (
    <Suspense>
      <UpdateCentre />
    </Suspense>
  );
}
