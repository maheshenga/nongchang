import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisRuntimeStateService } from '../src/common/runtime/redis-runtime-state.service';

describe('Redis runtime state multi-instance integration', () => {
  const first = new RedisRuntimeStateService(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379');
  const second = new RedisRuntimeStateService(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379');
  const prefix = `e2e:${randomUUID()}:`;

  beforeAll(async () => {
    await Promise.all([first.connect(), second.connect()]);
  });

  afterAll(async () => {
    await first.deleteByPrefix(prefix);
    await Promise.all([first.close(), second.close()]);
  });

  it('shares cache values and counters across service instances', async () => {
    await first.setJson(`${prefix}cache`, { status: 'shared' }, 10_000);
    await expect(second.getJson(`${prefix}cache`)).resolves.toEqual({ status: 'shared' });

    await expect(first.increment(`${prefix}counter`, 10_000)).resolves.toBe(1);
    await expect(second.increment(`${prefix}counter`, 10_000)).resolves.toBe(2);
  });

  it('coordinates a lock across service instances without allowing foreign release', async () => {
    await expect(first.acquireLock(`${prefix}lock`, 'owner-a', 10_000)).resolves.toBe(true);
    await expect(second.acquireLock(`${prefix}lock`, 'owner-b', 10_000)).resolves.toBe(false);
    await expect(second.releaseLock(`${prefix}lock`, 'owner-b')).resolves.toBe(false);
    await expect(first.releaseLock(`${prefix}lock`, 'owner-a')).resolves.toBe(true);
    await expect(second.acquireLock(`${prefix}lock`, 'owner-b', 10_000)).resolves.toBe(true);
  });
});
