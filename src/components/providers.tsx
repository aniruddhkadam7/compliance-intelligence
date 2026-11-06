"use client";
import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/client/api";

/** Client errors (bad request, forbidden, not found) will not succeed on retry; server and network errors may. */
const retryable = (e: unknown) => !(e instanceof ApiError && e.status >= 400 && e.status < 500);

function makeClient() {
  const client: QueryClient = new QueryClient({
    // No page renders its own error state, so a failed load would otherwise leave the view empty with no way back
    // short of a hard reload. One toast per failure, with a retry of that request.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (error instanceof DOMException && error.name === "AbortError") return; // navigated away
        toast.error("Some data could not be loaded", {
          id: `query-error:${query.queryHash}`,
          description: error instanceof Error ? error.message : undefined,
          action: { label: "Retry", onClick: () => client.refetchQueries({ queryKey: query.queryKey, exact: true }) },
        });
      },
    }),
    defaultOptions: {
      queries: {
        // Reference data changes only through imports, which invalidate every query.
        staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false,
        retry: (count, e) => count < 3 && retryable(e),
        retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
        // A query that failed is fetched again when its page is opened again, instead of replaying the error.
        refetchOnMount: (q) => q.state.status === "error" || q.isStale(),
      },
    },
  });
  return client;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {children}
          <Toaster position="bottom-right" toastOptions={{ className: "!text-[13px] !rounded-md !border-border" }} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
