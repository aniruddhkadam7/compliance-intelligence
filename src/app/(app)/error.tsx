"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-3 grid size-10 place-items-center rounded-md bg-danger-soft text-danger"><AlertTriangle className="size-5" /></span>
        <h1 className="text-[15px] font-semibold">This view could not be loaded</h1>
        <p className="mt-1 text-[13px] text-muted">The data service did not respond as expected. No data was changed.{error.digest && <> Reference <code className="font-mono text-xs">{error.digest}</code>.</>}</p>
        <Button size="sm" className="mt-4" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
