import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { UpdateCentre } from "./update-centre";

export const metadata = { title: TERMS.updates };

export default function UpdatesPage() {
  return (
    <Suspense>
      <UpdateCentre />
    </Suspense>
  );
}
