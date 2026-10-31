import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4">
      <div className="text-center">
        <span className="mx-auto mb-3 grid size-10 place-items-center rounded-md border border-border bg-surface text-muted"><SearchX className="size-5" /></span>
        <h1 className="text-[15px] font-semibold">Record not found</h1>
        <p className="mt-1 max-w-sm text-[13px] text-muted">The framework, control, requirement or page you requested does not exist in the imported data.</p>
        <Button asChild variant="primary" size="sm" className="mt-4"><Link href="/overview">Back to overview</Link></Button>
      </div>
    </div>
  );
}
