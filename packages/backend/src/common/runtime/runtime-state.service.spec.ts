import { describe, expect, it } from 'vitest';
import { MemoryRuntimeStateService } from './memory-runtime-state.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('MemoryRuntimeStateService', () => {
  it('shares JSON values, counters, and prefix invalidation through one adapter contract', async () => {
    let now = 1_000;
    const store = new MemoryRuntimeStateService(() => now);

    await store.setJson('cache:user:1', { role: 'merchant' }, 100);
    await store.setJson('cache:user:2', { role: 'agent' }, 100);
    await expect(store.getJson('cache:user:1')).resolves.toEqual({ role: 'merchant' });
    await expect(store.increment('counter:login', 100)).resolves.toBe(1);
    await expect(store.increment('counter:login', 100)).resolves.toBe(2);
    await expect(store.deleteByPrefix('cache:user:')).resolves.toBe(2);
    await expect(store.getJson('cache:user:1')).resolves.toBeNull();

    now += 101;
    await expect(store.increment('counter:login', 100)).resolves.toBe(1);
  });

  it('releases a lock only when the owner matches and expires stale owners', async () => {
    let now = 5_000;
    const store = new MemoryRuntimeStateService(() => now);

    await expect(store.acquireLock('lock:ai:1', 'owner-a', 50)).resolves.toBe(true);
    await expect(store.acquireLock('lock:ai:1', 'owner-b', 50)).resolves.toBe(false);
    await expect(store.releaseLock('lock:ai:1', 'owner-b')).resolves.toBe(false);
    await expect(store.releaseLock('lock:ai:1', 'owner-a')).resolves.toBe(true);

    await expect(store.acquireLock('lock:ai:1', 'owner-b', 50)).resolves.toBe(true);
    now += 51;
    await expect(store.acquireLock('lock:ai:1', 'owner-c', 50)).resolves.toBe(true);
  });
});

describe('RedisThrottlerStorage', () => {
  it('blocks after a distributed counter exceeds the configured limit', async () => {
    const now = () => 10_000;
    const store = new MemoryRuntimeStateService(now);
    const storage = new RedisThrottlerStorage(store, now);

    await expect(storage.increment('ip:1', 60_000, 2, 5_000, 'default')).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await storage.increment('ip:1', 60_000, 2, 5_000, 'default');
    await expect(storage.increment('ip:1', 60_000, 2, 5_000, 'default')).resolves.toMatchObject({
      totalHits: 3,
      isBlocked: true,
    });
    await expect(storage.increment('ip:1', 60_000, 2, 5_000, 'default')).resolves.toMatchObject({
      isBlocked: true,
      timeToBlockExpire: 5_000,
    });
  });
});
