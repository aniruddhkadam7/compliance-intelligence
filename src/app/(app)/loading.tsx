import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 px-4 py-5 sm:px-6">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-4 w-[520px] max-w-full" />
      <Skeleton className="h-[76px]" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[360px] xl:col-span-2" />
        <Skeleton className="h-[360px]" />
      </div>
    </div>
  );
}
