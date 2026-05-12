import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // dados frescos por 1 min — evita refetch desnecessário
      gcTime: 5 * 60_000,       // manter cache 5 min em memória
      refetchOnWindowFocus: false, // não refetchar ao trocar de tab
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
