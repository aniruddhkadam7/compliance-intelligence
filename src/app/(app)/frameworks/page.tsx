import { Suspense } from "react";
import { FrameworkRepository } from "./repository";

export const metadata = { title: "Framework Repository" };

export default function FrameworksPage() {
  return (
    <Suspense>
      <FrameworkRepository />
    </Suspense>
  );
}
