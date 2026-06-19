import { useState, useEffect, useCallback } from 'react';

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

interface CacheEntry<T> {
  data: T;
  ts: number;
  /** 同一 key 的进行中请求:后续调用者等待同一 promise 而非发起新请求(去重) */
  promise?: Promise<T>;
}

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL = 60_000; // 1 分钟:对列表类数据足够,且避免脏读

export interface UseApiOptions {
  /** 缓存键:传了则启用 key 级缓存+飞行中请求去重;不传则与旧行为一致(每次挂载重新拉取)。 */
  cacheKey?: string;
  /** 缓存有效期(ms),默认 60000。仅 cacheKey 存在时生效。 */
  ttl?: number;
}

export function useApi<T>(fetcher: () => Promise<T>, opts?: UseApiOptions): UseApiResult<T> {
  // 只使用显式 cacheKey。不同 API 模块可能导出同名函数(如 listMerchants),
  // 用 Function.name 自动推导会让无关接口共享缓存/飞行中请求。
  const cacheKey = opts?.cacheKey;
  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const [data, setData] = useState<T | null>(() => {
    if (cacheKey) {
      const entry = cache.get(cacheKey);
      if (entry && Date.now() - entry.ts <= ttl) {
        return entry.data; // 同步命中:避免挂载闪烁 loading
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const key = cacheKey;
    // 飞行中请求去重:如果同一 key 已有进行中的 promise,等待它而非新建。
    if (key) {
      const inflight = cache.get(key);
      if (inflight?.promise) {
        try {
          const result = await inflight.promise;
          setData(result);
          setError(null);
          setLoading(false);
          return;
        } catch { /* 飞行中请求失败时继续走到 fetch 路径 */ }
      }
    }
    setLoading(true);
    setError(null);
    const fetchPromise = fetcher();
    if (key) {
      cache.set(key, { data: undefined as any, ts: 0, promise: fetchPromise });
    }
    try {
      const result = await fetchPromise;
      if (key) {
        cache.set(key, { data: result, ts: Date.now() });
      }
      setData(result);
    } catch (e) {
      if (key) cache.delete(key); // 失败不缓存
      setError(e instanceof Error ? e.message : '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
    // fetcher 是稳定的模块级函数;若调用方传内联闭包需自行 useCallback
  }, [fetcher, cacheKey]);

  useEffect(() => { void load(); }, [load]);

  const reload = useCallback(async () => {
    if (cacheKey) cache.delete(cacheKey);
    await load();
  }, [load, cacheKey]);

  return { data, loading, error, reload };
}
