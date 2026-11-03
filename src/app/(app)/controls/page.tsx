import { TERMS } from "@/lib/terms";
import { Suspense } from "react";
import { ControlRegister } from "./register";

export const metadata = { title: TERMS.clientControls };

export default function ControlsPage() {
  return (
    <Suspense>
      <ControlRegister />
    </Suspense>
  );
}
