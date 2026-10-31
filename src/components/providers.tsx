"use client";
import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    // Reference data changes only through imports, which invalidate every query.
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
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
