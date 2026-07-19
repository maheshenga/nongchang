import { Injectable, OnApplicationShutdown, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import type { RuntimeStateStore } from './runtime-state.types';
import { MetricsService } from '../../telemetry/metrics.service';

const PREFIX = 'nongchang:';
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const INCREMENT_SCRIPT = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return value
`;

@Injectable()
export class RedisRuntimeStateService implements RuntimeStateStore, OnApplicationShutdown {
  private readonly client: Redis;

  constructor(url: string, @Optional() private readonly metrics?: MetricsService) {
    this.client = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
    });
    this.client.on('error', () => undefined);
  }

  private key(value: string): string {
    return `${PREFIX}${value}`;
  }

  async connect(): Promise<void> {
    try {
      if (this.client.status === 'wait') await this.client.connect();
      const pong = await this.client.ping();
      if (pong !== 'PONG') throw new Error('Redis ping failed');
      this.metrics?.setRuntimeStateAvailable(true);
    } catch (error) {
      this.metrics?.setRuntimeStateAvailable(false);
      throw error;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(this.key(key));
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      await this.client.del(this.key(key));
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    await this.client.set(this.key(key), JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', this.key(`${prefix}*`), 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) deleted += await this.client.unlink(...keys);
    } while (cursor !== '0');
    return deleted;
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    return Number(await this.client.eval(INCREMENT_SCRIPT, 1, this.key(key), ttlMs));
  }

  async acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean> {
    return (await this.client.set(this.key(key), owner, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async releaseLock(key: string, owner: string): Promise<boolean> {
    return Number(await this.client.eval(RELEASE_LOCK_SCRIPT, 1, this.key(key), owner)) === 1;
  }

  async ping(): Promise<boolean> {
    try {
      const available = (await this.client.ping()) === 'PONG';
      this.metrics?.setRuntimeStateAvailable(available);
      return available;
    } catch {
      this.metrics?.setRuntimeStateAvailable(false);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client.status === 'end') return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect(false);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
