import { describe, expect, it } from 'vitest';
import { MemoryRuntimeStateService } from './memory-runtime-state.service';
import { IdempotencyLockService } from './idempotency-lock.service';

describe('IdempotencyLockService', () => {
  it('serializes contenders for the same operation key', async () => {
    const locks = new IdempotencyLockService(new MemoryRuntimeStateService());
    let active = 0;
    let maxActive = 0;
    const task = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return 'ok';
    };

    await expect(Promise.all([
      locks.run('ai:t1:u1:key', task),
      locks.run('ai:t1:u1:key', task),
    ])).resolves.toEqual(['ok', 'ok']);
    expect(maxActive).toBe(1);
  });

  it('allows unrelated operation keys to run concurrently', async () => {
    const locks = new IdempotencyLockService(new MemoryRuntimeStateService());
    let active = 0;
    let maxActive = 0;
    const task = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    };

    await Promise.all([locks.run('key-a', task), locks.run('key-b', task)]);
    expect(maxActive).toBe(2);
  });
});
