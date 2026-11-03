import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { FrameworkRepository } from "./repository";

export const metadata = { title: TERMS.frameworks };

export default function FrameworksPage() {
  return (
    <Suspense>
      <FrameworkRepository />
    </Suspense>
  );
}
