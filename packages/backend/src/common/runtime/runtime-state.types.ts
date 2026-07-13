export const RUNTIME_STATE = Symbol('RUNTIME_STATE');

export interface RuntimeStateStore {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<number>;
  increment(key: string, ttlMs: number): Promise<number>;
  acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<boolean>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export type RuntimeStateDriver = 'memory' | 'redis';

export function readRuntimeStateDriver(env: NodeJS.ProcessEnv = process.env): RuntimeStateDriver {
  const raw = env.RUNTIME_STATE_DRIVER?.trim().toLowerCase();
  if (!raw) return env.NODE_ENV === 'production' ? 'redis' : 'memory';
  if (raw !== 'memory' && raw !== 'redis') {
    throw new Error('[启动校验] RUNTIME_STATE_DRIVER 必须为 memory 或 redis');
  }
  if (env.NODE_ENV === 'production' && raw !== 'redis') {
    throw new Error('[启动校验] 生产环境 RUNTIME_STATE_DRIVER 必须为 redis');
  }
  return raw;
}

export function readRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.REDIS_URL?.trim();
  if (!value) throw new Error('[启动校验] REDIS_URL 在 Redis 运行时模式下不能为空');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('[启动校验] REDIS_URL 必须是合法的 redis:// 或 rediss:// URL');
  }
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('[启动校验] REDIS_URL 必须使用 redis:// 或 rediss://');
  }
  return value;
}
