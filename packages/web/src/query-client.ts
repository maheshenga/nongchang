import { notifyManager, QueryClient } from '@tanstack/react-query';

// Keep server-state notifications in the microtask queue so UI state settles
// with the request promise instead of an extra timer turn.
notifyManager.setScheduler(queueMicrotask);

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createAppQueryClient();

export async function resetAppQueryCache(client: QueryClient = queryClient): Promise<void> {
  await client.cancelQueries();
  client.clear();
}
