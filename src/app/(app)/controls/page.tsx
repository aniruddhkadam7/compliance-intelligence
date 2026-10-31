import { Suspense } from "react";
import { ControlRegister } from "./register";

export const metadata = { title: "Internal CCF Mapping" };

export default function ControlsPage() {
  return (
    <Suspense>
      <ControlRegister />
    </Suspense>
  );
}
