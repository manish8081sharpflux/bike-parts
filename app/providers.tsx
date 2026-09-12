"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const posthogStarted = useRef(false);

  useEffect(() => {
    if (posthogStarted.current || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      return;
    }

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: "history_change",
    });
    posthogStarted.current = true;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
