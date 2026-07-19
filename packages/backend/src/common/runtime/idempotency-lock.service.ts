import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MemoryRuntimeStateService } from './memory-runtime-state.service';
import { RUNTIME_STATE, type RuntimeStateStore } from './runtime-state.types';

interface LockRunOptions {
  ttlMs?: number;
  waitTimeoutMs?: number;
  retryIntervalMs?: number;
}

@Injectable()
export class IdempotencyLockService {
  constructor(
    @Optional() @Inject(RUNTIME_STATE)
    private readonly store: RuntimeStateStore = new MemoryRuntimeStateService(),
  ) {}

  async run<T>(key: string, task: () => Promise<T>, options: LockRunOptions = {}): Promise<T> {
    const owner = randomUUID();
    const ttlMs = options.ttlMs ?? 35_000;
    const retryIntervalMs = options.retryIntervalMs ?? 10;
    const deadline = Date.now() + (options.waitTimeoutMs ?? 2_000);
    const lockKey = `lock:${key}`;

    while (Date.now() <= deadline) {
      if (await this.store.acquireLock(lockKey, owner, ttlMs)) {
        try {
          return await task();
        } finally {
          await this.store.releaseLock(lockKey, owner);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }

    // Redis coordination is an optimization around durable database idempotency.
    // On lock timeout, execute the existing database-guarded path instead of
    // turning a cache outage into an availability or financial-correctness bypass.
    return task();
  }
}
