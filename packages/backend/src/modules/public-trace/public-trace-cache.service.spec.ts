import { describe, expect, it } from 'vitest';
import { MemoryRuntimeStateService } from '../../common/runtime/memory-runtime-state.service';
import { PublicTraceCacheService } from './public-trace-cache.service';

const value = { code: 'ORC-X', frozen: false as const } as any;

describe('PublicTraceCacheService', () => {
  it('shares entries across instances and expires them at the configured ttl', async () => {
    let now = 1_000;
    const store = new MemoryRuntimeStateService(() => now);
    const first = new PublicTraceCacheService(store);
    const second = new PublicTraceCacheService(store);

    await first.set('ORC-X', 't1', 'b1', value);
    now = 30_999;
    await expect(second.get('ORC-X')).resolves.toEqual(value);
    now = 31_001;
    await expect(second.get('ORC-X')).resolves.toBeNull();
  });

  it('invalidates by batch and tenant without touching unrelated entries', async () => {
    const store = new MemoryRuntimeStateService();
    const first = new PublicTraceCacheService(store);
    const second = new PublicTraceCacheService(store);
    await first.set('A', 't1', 'b1', value);
    await first.set('B', 't1', 'b2', value);
    await first.set('C', 't2', 'b3', value);

    await second.invalidateBatch('b1');
    await expect(first.get('A')).resolves.toBeNull();
    await expect(first.get('B')).resolves.toEqual(value);
    await second.invalidateTenant('t1');
    await expect(first.get('B')).resolves.toBeNull();
    await expect(first.get('C')).resolves.toEqual(value);
  });
});
