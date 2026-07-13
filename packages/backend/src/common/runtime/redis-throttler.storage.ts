import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RuntimeStateStore } from './runtime-state.types';

interface ThrottlerStorageRecordLike {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly store: RuntimeStateStore,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecordLike> {
    const safeName = throttlerName || 'default';
    const counterKey = `throttle:${safeName}:${key}`;
    const blockKey = `${counterKey}:blocked`;
    const blockedUntil = await this.store.getJson<number>(blockKey);
    if (blockedUntil && blockedUntil > this.now()) {
      return {
        totalHits: limit + 1,
        timeToExpire: ttl,
        isBlocked: true,
        timeToBlockExpire: blockedUntil - this.now(),
      };
    }

    const totalHits = await this.store.increment(counterKey, ttl);
    const isBlocked = totalHits > limit;
    if (isBlocked && blockDuration > 0) {
      await this.store.setJson(blockKey, this.now() + blockDuration, blockDuration);
    }
    return {
      totalHits,
      timeToExpire: ttl,
      isBlocked,
      timeToBlockExpire: isBlocked ? blockDuration : 0,
    };
  }
}
