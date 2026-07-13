import { notifyManager, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/request';

// Keep server-state notifications in the microtask queue so UI state settles
// with the request promise instead of an extra timer turn.
notifyManager.setScheduler(queueMicrotask);

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof TypeError) return true;
  return error instanceof ApiError
    && (error.status === 408 || error.status === 429 || (error.status >= 500 && error.status <= 599));
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: 0,
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
