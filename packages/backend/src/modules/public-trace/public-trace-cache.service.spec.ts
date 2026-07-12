import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicTraceCacheService } from './public-trace-cache.service';

const value = { code: 'ORC-X', frozen: false as const } as any;

describe('PublicTraceCacheService', () => {
  afterEach(() => vi.useRealTimers());

  it('expires entries at the configured ttl', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const cache = new PublicTraceCacheService();
    cache.set('ORC-X', 't1', 'b1', value);
    vi.setSystemTime(30_999);
    expect(cache.get('ORC-X')).toBe(value);
    vi.setSystemTime(31_001);
    expect(cache.get('ORC-X')).toBeNull();
  });

  it('invalidates by batch and tenant without touching unrelated entries', () => {
    const cache = new PublicTraceCacheService();
    cache.set('A', 't1', 'b1', value);
    cache.set('B', 't1', 'b2', value);
    cache.set('C', 't2', 'b3', value);

    cache.invalidateBatch('b1');
    expect(cache.get('A')).toBeNull();
    expect(cache.get('B')).toBe(value);
    cache.invalidateTenant('t1');
    expect(cache.get('B')).toBeNull();
    expect(cache.get('C')).toBe(value);
  });
});
