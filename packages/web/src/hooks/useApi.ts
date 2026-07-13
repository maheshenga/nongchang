import { useCallback, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../query-client';

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const DEFAULT_TTL = 60_000;

export interface UseApiOptions {
  /** Stable resource identity used for cache sharing and in-flight deduplication. */
  cacheKey?: string;
  /** Cache freshness window in milliseconds. */
  ttl?: number;
}

export function useApi<T>(fetcher: () => Promise<T>, opts?: UseApiOptions): UseApiResult<T> {
  const instanceId = useId();
  const cacheKey = opts?.cacheKey;
  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const query = useQuery({
    queryKey: cacheKey ? ['api', cacheKey] : ['api-instance', instanceId],
    queryFn: () => fetcher(),
    staleTime: cacheKey ? ttl : 0,
    gcTime: cacheKey ? Math.max(ttl, DEFAULT_TTL) : 0,
    refetchOnMount: 'always',
  }, queryClient);
  const { refetch } = query;

  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    data: query.data ?? null,
    loading: query.isPending,
    error: query.error instanceof Error
      ? query.error.message
      : query.error
        ? '加载失败'
        : null,
    reload,
  };
}
